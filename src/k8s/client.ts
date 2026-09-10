import { readFile } from 'node:fs/promises';

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
const TOKEN_PATH = `${SERVICE_ACCOUNT_DIR}/token`;
const NAMESPACE_PATH = `${SERVICE_ACCOUNT_DIR}/namespace`;
const TOKEN_CACHE_MS = 60_000;

export class KubernetesApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'KubernetesApiError';
    this.status = status;
  }
}

export interface KubernetesClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  namespace: () => Promise<string>;
}

export function inClusterBaseUrl(env = process.env): string | null {
  const host = env.KUBERNETES_SERVICE_HOST;
  const port = env.KUBERNETES_SERVICE_PORT_HTTPS ?? env.KUBERNETES_SERVICE_PORT;

  if (!host || !port) {
    return null;
  }

  return `https://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

export function createInClusterClient(baseUrl: string): KubernetesClient {
  let token = '';
  let tokenReadAt = 0;

  const currentToken = async (): Promise<string> => {
    if (token !== '' && Date.now() - tokenReadAt < TOKEN_CACHE_MS) {
      return token;
    }
    token = (await readFile(TOKEN_PATH, 'utf8')).trim();
    tokenReadAt = Date.now();
    return token;
  };

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await currentToken()}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new KubernetesApiError(
        response.status,
        `${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    return (await response.json()) as T;
  };

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    namespace: async () => (await readFile(NAMESPACE_PATH, 'utf8')).trim(),
  };
}
