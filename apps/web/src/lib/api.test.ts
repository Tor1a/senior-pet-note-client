import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from './api';

// fetch 는 가짜(mock)로 바꿔 실제 서버 없이 검사한다
function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(token: string | null, response: Response | Error) {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
  const onUnauthorized = vi.fn();
  const client = createApiClient({
    baseUrl: 'http://localhost:8080',
    getToken: () => token,
    onUnauthorized,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const headersOf = (call = 0) => (fetchImpl.mock.calls[call][1]?.headers ?? {}) as Record<string, string>;
  return { client, fetchImpl, onUnauthorized, headersOf };
}

describe('API 클라이언트 — 토큰 헤더', () => {
  it('토큰이 있으면 Authorization: Bearer 헤더를 붙인다', async () => {
    const { client, fetchImpl, headersOf } = setup('abc.def.ghi', jsonResponse(200, { id: 1, email: 'a@b.co' }));
    await expect(client.me()).resolves.toEqual({ id: 1, email: 'a@b.co' });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:8080/api/me');
    expect(headersOf().Authorization).toBe('Bearer abc.def.ghi');
  });

  it('토큰이 없으면 Authorization 헤더를 붙이지 않는다', async () => {
    const { client, headersOf } = setup(null, jsonResponse(200, { accessToken: 't', user: { id: 1, email: 'a@b.co' } }));
    await client.login('a@b.co', 'password1');
    expect(headersOf().Authorization).toBeUndefined();
  });

  it('로그인·회원가입은 계약대로 POST + JSON 본문으로 보낸다', async () => {
    const body = { accessToken: 't', user: { id: 1, email: 'a@b.co' } };
    const { client, fetchImpl, headersOf } = setup(null, jsonResponse(201, body));
    await expect(client.signup('a@b.co', 'password1')).resolves.toEqual(body);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/auth/signup');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'a@b.co', password: 'password1' });
    expect(headersOf()['Content-Type']).toBe('application/json');
  });
});

describe('API 클라이언트 — 401 처리', () => {
  it('토큰을 붙인 요청이 401 이면 onUnauthorized(로그아웃)를 부른다', async () => {
    const { client, onUnauthorized } = setup(
      'expired',
      jsonResponse(401, { code: 'UNAUTHORIZED', message: 'token expired' }),
    );
    const err = await client.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status: 401, code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('로그인 시도(토큰 없음)의 401 은 로그아웃 처리하지 않고 오류만 돌려준다', async () => {
    const { client, onUnauthorized } = setup(null, jsonResponse(401, { code: 'UNAUTHORIZED', message: 'bad' }));
    const err = await client.login('a@b.co', 'wrong-pass').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(toUserMessage(err, 'login')).toBe('이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.');
  });

  it('401 이 아닌 오류(409)에는 onUnauthorized 를 부르지 않는다', async () => {
    const { client, onUnauthorized } = setup('t', jsonResponse(409, { code: 'EMAIL_TAKEN', message: 'taken' }));
    const err = await client.signup('a@b.co', 'password1').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('API 클라이언트 — 네트워크 오류', () => {
  it('서버가 꺼져 있으면(fetch 실패) network 오류로 바꾸고 죽지 않는다', async () => {
    const { client, onUnauthorized } = setup('t', new TypeError('Failed to fetch'));
    const err = await client.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'network', status: 0 });
    expect(isNetworkError(err)).toBe(true);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(toUserMessage(err, 'login')).toBe(NETWORK_ERROR_MESSAGE);
    expect(NETWORK_ERROR_MESSAGE).toContain('서버에 연결할 수 없어요');
  });

  it('응답이 시간 한도를 넘으면 network 오류로 본다', async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      getToken: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10,
    });
    await expect(client.me()).rejects.toMatchObject({ kind: 'network' });
  });

  it('오류 본문이 JSON 이 아니어도(예: 502 HTML) 죽지 않고 http 오류로 돌려준다', async () => {
    const { client } = setup('t', new Response('<html>Bad Gateway</html>', { status: 502 }));
    const err = await client.me().catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'http', status: 502, code: null });
    expect(toUserMessage(err)).toBe('서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.');
  });
});

describe('toUserMessage — 한국어 안내 문구', () => {
  it('계약의 오류 코드별 문구', () => {
    expect(toUserMessage(new ApiError('http', 409, 'EMAIL_TAKEN', 'x'), 'signup')).toBe(
      '이미 가입된 이메일이에요. 로그인해 주세요.',
    );
    expect(toUserMessage(new ApiError('http', 400, 'VALIDATION_ERROR', 'x'), 'signup')).toContain('8자 이상');
    expect(toUserMessage(new ApiError('http', 401, 'UNAUTHORIZED', 'x'))).toBe('로그인이 만료됐어요. 다시 로그인해 주세요.');
    expect(toUserMessage(new Error('?'))).toBe('문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
  });
});

describe('Retry-After 헤더 (계정 API 429)', () => {
  it('429 의 Retry-After 초를 ApiError 에 담는다', async () => {
    const client = createApiClient({
      baseUrl: 'http://x',
      getToken: () => 't',
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: 'TOO_MANY_ATTEMPTS', message: 'm' }), {
          status: 429,
          headers: { 'Retry-After': '120' },
        }),
    });
    await expect(client.request('/api/me/withdraw', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      retryAfterSec: 120,
    });
  });
  it('400 CURRENT_PASSWORD_MISMATCH 는 onUnauthorized 를 부르지 않는다', async () => {
    let called = 0;
    const client = createApiClient({
      baseUrl: 'http://x',
      getToken: () => 't',
      onUnauthorized: () => void called++,
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: 'CURRENT_PASSWORD_MISMATCH', message: 'm' }), { status: 400 }),
    });
    await expect(client.request('/api/me/password', { method: 'PUT', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(called).toBe(0);
  });
});

describe('API 클라이언트 — 토큰 교체 경합', () => {
  it('요청을 보낸 뒤 토큰이 바뀌었다면 옛 토큰의 401 은 로그아웃하지 않는다', async () => {
    let token = 'old';
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://x',
      getToken: () => token,
      onUnauthorized,
      fetchImpl: async () => {
        token = 'new'; // 응답이 오기 전에 비밀번호 변경으로 토큰이 교체됨
        return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'm' }), { status: 401 });
      },
    });
    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
  it('토큰이 그대로면 401 은 로그아웃한다', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://x',
      getToken: () => 'same',
      onUnauthorized,
      fetchImpl: async () => new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'm' }), { status: 401 }),
    });
    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('비밀번호 변경 동시 요청 충돌(409 PASSWORD_CHANGE_CONFLICT)', () => {
  it('일반 409 문구가 아니라 다시 시도 안내를 보여 준다', () => {
    const msg = toUserMessage(new ApiError('http', 409, 'PASSWORD_CHANGE_CONFLICT', 'x'), 'password');
    expect(msg).toBe('다른 곳에서 비밀번호를 바꾸는 중이에요. 잠시 뒤에 다시 시도해 주세요.');
    expect(msg).not.toContain('이미 처리된');
  });

  it('409 는 onUnauthorized 를 부르지 않는다', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://x',
      getToken: () => 'tok',
      onUnauthorized,
      fetchImpl: async () =>
        new Response(JSON.stringify({ code: 'PASSWORD_CHANGE_CONFLICT', message: 'm' }), { status: 409 }),
    });
    await expect(client.me()).rejects.toMatchObject({ status: 409, code: 'PASSWORD_CHANGE_CONFLICT' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
