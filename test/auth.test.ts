import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { callerOf, createAuthMiddleware, extractBearerToken, tokenMatches } from '../src/http/auth.ts';
import type { AuthOptions } from '../src/http/auth.ts';
import { isAllowed, toServiceAccount } from '../src/k8s/token-review.ts';

interface Captured {
  status?: number;
  headers: Record<string, string>;
  body?: unknown;
}

function fakeResponse(): { res: Response; captured: Captured } {
  const captured: Captured = { headers: {} };

  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    set(name: string, value: string) {
      captured.headers[name] = value;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;

  return { res, captured };
}

async function runMiddleware(options: Partial<AuthOptions>, authorization?: string): Promise<{
  passed: boolean;
  caller: string | undefined;
  captured: Captured;
}> {
  const middleware = createAuthMiddleware({
    sharedToken: options.sharedToken,
    reviewToken: options.reviewToken,
  });
  const req = { headers: authorization === undefined ? {} : { authorization } } as Request;
  const { res, captured } = fakeResponse();

  const settled = new Promise<boolean>((resolve) => {
    const original = res.json.bind(res);
    (res as unknown as { json: (body: unknown) => unknown }).json = (body: unknown) => {
      const result = original(body);
      resolve(false);
      return result;
    };
    middleware(req, res, () => resolve(true));
  });

  const passed = await settled;

  return { passed, caller: callerOf(req)?.name, captured };
}

test('extractBearerToken accepts the header shapes clients actually send', () => {
  assert.equal(extractBearerToken('Bearer abc'), 'abc');
  assert.equal(extractBearerToken('bearer abc'), 'abc');
  assert.equal(extractBearerToken('Bearer\tabc'), 'abc');
  assert.equal(extractBearerToken('  Bearer   abc  '), 'abc');
  assert.equal(extractBearerToken('Basic abc'), undefined);
  assert.equal(extractBearerToken('Bearer'), undefined);
  assert.equal(extractBearerToken(undefined), undefined);
});

test('tokenMatches survives inputs of a different length', () => {
  assert.equal(tokenMatches('secret', 'secret'), true);
  assert.equal(tokenMatches('secret', 'secre'), false);
  assert.equal(tokenMatches('secret', 'secretlonger'), false);
  assert.equal(tokenMatches('secret', ''), false);
  assert.equal(tokenMatches('secret', undefined), false);
});

test('tokenMatches compares bytes, not decoded characters', () => {
  assert.equal(tokenMatches('caf\u00e9', 'caf\u00e9'), true);
  assert.equal(tokenMatches('caf\u00e9', 'cafe'), false);
});

test('no credential configured leaves the endpoint open', async () => {
  const { passed } = await runMiddleware({});
  assert.equal(passed, true);
});

test('a missing or wrong token is answered with 401 and a challenge', async () => {
  for (const header of [undefined, 'Bearer wrong', 'Basic secret']) {
    const { passed, captured } = await runMiddleware({ sharedToken: 'secret' }, header);

    assert.equal(passed, false);
    assert.equal(captured.status, 401);
    assert.match(captured.headers['WWW-Authenticate'] ?? '', /^Bearer /);
  }
});

test('the shared token passes and is recorded as such', async () => {
  const { passed, caller } = await runMiddleware({ sharedToken: 'secret' }, 'Bearer secret');

  assert.equal(passed, true);
  assert.equal(caller, 'shared-token');
});

test('a reviewed service account passes and is recorded by name', async () => {
  const { passed, caller } = await runMiddleware(
    {
      reviewToken: async (token) => (token === 'sa-token'
        ? { username: 'system:serviceaccount:agents:claude', serviceAccount: 'agents:claude' }
        : null),
    },
    'Bearer sa-token',
  );

  assert.equal(passed, true);
  assert.equal(caller, 'agents:claude');
});

test('the shared token is tried first, so a review is skipped when it matches', async () => {
  let reviews = 0;
  const { passed } = await runMiddleware(
    {
      sharedToken: 'secret',
      reviewToken: async () => {
        reviews += 1;
        return null;
      },
    },
    'Bearer secret',
  );

  assert.equal(passed, true);
  assert.equal(reviews, 0);
});

test('both credentials are accepted when both are configured', async () => {
  const options = {
    sharedToken: 'secret',
    reviewToken: async (token: string) => (token === 'sa-token'
      ? { username: 'system:serviceaccount:agents:claude', serviceAccount: 'agents:claude' }
      : null),
  };

  assert.equal((await runMiddleware(options, 'Bearer secret')).passed, true);
  assert.equal((await runMiddleware(options, 'Bearer sa-token')).passed, true);
  assert.equal((await runMiddleware(options, 'Bearer neither')).passed, false);
});

test('a service account username is reduced to namespace:name', () => {
  assert.equal(toServiceAccount('system:serviceaccount:agents:claude'), 'agents:claude');
  assert.equal(toServiceAccount('kubernetes-admin'), null);
  assert.equal(toServiceAccount('system:serviceaccount:agents'), null);
  assert.equal(toServiceAccount('system:serviceaccount::claude'), null);
});

test('an empty allow list admits any authenticated caller, a filled one does not', () => {
  const claude = { username: 'system:serviceaccount:agents:claude', serviceAccount: 'agents:claude' };
  const human = { username: 'kubernetes-admin', serviceAccount: null };

  assert.equal(isAllowed(claude, []), true);
  assert.equal(isAllowed(human, []), true);
  assert.equal(isAllowed(claude, ['agents:claude']), true);
  assert.equal(isAllowed(claude, ['agents:other']), false);
  assert.equal(isAllowed(human, ['agents:claude']), false);
});
