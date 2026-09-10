import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { TokenReviewer } from '../k8s/token-review.ts';

export const SHARED_TOKEN_CALLER = 'shared-token';

export interface AuthOptions {
  sharedToken: string | undefined;
  reviewToken: TokenReviewer | undefined;
}

export interface CallerIdentity {
  name: string;
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim());
  return match?.[1];
}

export function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (presented === undefined) {
    return false;
  }

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export function callerOf(req: Request): CallerIdentity | undefined {
  return (req as Request & { caller?: CallerIdentity }).caller;
}

export function createAuthMiddleware(options: AuthOptions): RequestHandler {
  const { sharedToken, reviewToken } = options;

  if (sharedToken === undefined && reviewToken === undefined) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    void (async () => {
      const presented = extractBearerToken(req.headers.authorization);

      if (presented !== undefined) {
        if (sharedToken !== undefined && tokenMatches(sharedToken, presented)) {
          attach(req, { name: SHARED_TOKEN_CALLER }, presented);
          next();
          return;
        }

        if (reviewToken !== undefined) {
          const reviewed = await reviewToken(presented);

          if (reviewed !== null) {
            attach(req, { name: reviewed.serviceAccount ?? reviewed.username }, presented);
            next();
            return;
          }
        }
      }

      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="mc-mcp-server"')
        .json({ error: 'unauthorized', message: 'A valid Bearer token is required.' });
    })();
  };
}

function attach(req: Request, caller: CallerIdentity, token: string): void {
  const target = req as Request & {
    caller?: CallerIdentity;
    auth?: { token: string; clientId: string; scopes: string[] };
  };

  target.caller = caller;
  target.auth = { token, clientId: caller.name, scopes: [] };
}
