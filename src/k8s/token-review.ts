import { createHash } from 'node:crypto';
import type { KubernetesClient } from './client.ts';
import { describeError, log } from '../logger.ts';

const SERVICE_ACCOUNT_PREFIX = 'system:serviceaccount:';
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 256;

interface TokenReviewResponse {
  status?: {
    authenticated?: boolean;
    user?: { username?: string };
    error?: string;
  };
}

export interface ReviewedCaller {
  username: string;
  serviceAccount: string | null;
}

export function toServiceAccount(username: string): string | null {
  if (!username.startsWith(SERVICE_ACCOUNT_PREFIX)) {
    return null;
  }

  const [namespace, name] = username.slice(SERVICE_ACCOUNT_PREFIX.length).split(':');

  return namespace && name ? `${namespace}:${name}` : null;
}

export function isAllowed(caller: ReviewedCaller, allowed: readonly string[]): boolean {
  if (allowed.length === 0) {
    return true;
  }
  return caller.serviceAccount !== null && allowed.includes(caller.serviceAccount);
}

export type TokenReviewer = (token: string) => Promise<ReviewedCaller | null>;

export function createTokenReviewer(
  client: KubernetesClient,
  allowed: readonly string[],
): TokenReviewer {
  const cache = new Map<string, { caller: ReviewedCaller | null; expiresAt: number }>();

  const remember = (key: string, caller: ReviewedCaller | null): ReviewedCaller | null => {
    if (cache.size >= CACHE_LIMIT) {
      cache.clear();
    }
    cache.set(key, { caller, expiresAt: Date.now() + CACHE_TTL_MS });
    return caller;
  };

  return async (token) => {
    const key = createHash('sha256').update(token).digest('hex');
    const cached = cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.caller;
    }

    let response: TokenReviewResponse;

    try {
      response = await client.post<TokenReviewResponse>(
        '/apis/authentication.k8s.io/v1/tokenreviews',
        { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenReview', spec: { token } },
      );
    } catch (error) {
      log('error', 'token review failed', { error: describeError(error) });
      return null;
    }

    if (response.status?.authenticated !== true) {
      return remember(key, null);
    }

    const username = response.status.user?.username ?? '';
    const caller: ReviewedCaller = { username, serviceAccount: toServiceAccount(username) };

    if (!isAllowed(caller, allowed)) {
      log('warn', 'rejected an authenticated caller that is not on the allow list', { username });
      return remember(key, null);
    }

    return remember(key, caller);
  };
}
