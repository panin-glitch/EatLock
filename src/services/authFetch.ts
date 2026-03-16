import { ensureAuth, getAccessToken, refreshAuthSession } from './authService';

export class AuthRequiredError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  return error instanceof AuthRequiredError
    || (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AuthRequiredError');
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

async function getBearerToken(): Promise<string> {
  let token = await getAccessToken();
  if (!token) {
    token = await ensureAuth();
  }
  if (!token || !isJwt(token)) {
    throw new AuthRequiredError();
  }
  return token;
}

export async function fetchWithAuth(
  url: string,
  init: RequestInit,
  options?: { retryOn401?: boolean },
): Promise<Response> {
  const token = await getBearerToken();
  const retryOn401 = options?.retryOn401 ?? true;
  const baseHeaders = normalizeHeaders(init.headers);

  const makeInit = (bearer: string): RequestInit => ({
    ...init,
    headers: {
      ...baseHeaders,
      Authorization: `Bearer ${bearer}`,
    },
  });

  let response = await fetch(url, makeInit(token));
  if (response.status === 401 && retryOn401) {
    const refreshed = await refreshAuthSession();
    if (!refreshed || !isJwt(refreshed)) {
      return response;
    }
    response = await fetch(url, makeInit(refreshed));
  }

  return response;
}
