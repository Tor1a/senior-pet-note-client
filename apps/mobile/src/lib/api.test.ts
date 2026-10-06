// API 클라이언트(src/lib/api.ts) 테스트: 가짜 fetch 로 백엔드 인증 계약을 확인한다.
// 모바일에서 작성한 테스트. packages/shared 통합 때 웹과 함께 쓰도록 옮긴다.

import { ApiError, createApiClient, isNetworkError, toUserMessage, type ApiClientOptions } from './api';

const BASE = 'http://10.0.2.2:8080';

/** 정해진 응답을 돌려주고, 받은 요청을 기록하는 가짜 fetch */
function fakeFetch(status: number, body?: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

function client(fetchImpl: typeof fetch, extra: Partial<ApiClientOptions> = {}) {
  return createApiClient({ baseUrl: BASE, getToken: () => null, fetchImpl, ...extra });
}

describe('인증 계약', () => {
  it('signup: POST /api/auth/signup 에 JSON 본문을 보내고 201 응답을 돌려준다', async () => {
    const res = { accessToken: 'jwt-1', user: { id: 1, email: 'a@b.co' } };
    const { impl, calls } = fakeFetch(201, res);
    await expect(client(impl).signup('a@b.co', 'password1')).resolves.toEqual(res);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/auth/signup`);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'a@b.co', password: 'password1' });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
  });

  it('login: POST /api/auth/login 은 200 응답을 돌려준다', async () => {
    const res = { accessToken: 'jwt-2', user: { id: 'u2', email: 'c@d.co' } };
    const { impl, calls } = fakeFetch(200, res);
    await expect(client(impl).login('c@d.co', 'pw')).resolves.toEqual(res);
    expect(calls[0].url).toBe(`${BASE}/api/auth/login`);
    expect(calls[0].init.method).toBe('POST');
  });

  it('me: GET /api/me 에 Bearer 토큰을 붙인다', async () => {
    const { impl, calls } = fakeFetch(200, { id: 1, email: 'a@b.co' });
    await expect(client(impl, { getToken: () => 'tok' }).me()).resolves.toEqual({ id: 1, email: 'a@b.co' });
    expect(calls[0].url).toBe(`${BASE}/api/me`);
    expect(calls[0].init.method).toBe('GET');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
});

describe('오류 처리', () => {
  it.each([
    [400, 'VALIDATION_ERROR'],
    [401, 'UNAUTHORIZED'],
    [409, 'EMAIL_TAKEN'],
  ])('%i 응답은 ApiError(http, code=%s)', async (status, code) => {
    const { impl } = fakeFetch(status, { code, message: 'msg' });
    const err = await client(impl)
      .login('a@b.co', 'pw')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status, code, message: 'msg' });
  });

  it('오류 본문이 JSON 이 아니어도 상태 코드로 오류를 만든다', async () => {
    const { impl } = fakeFetch(500, '<html>Internal Error</html>');
    await expect(client(impl).me()).rejects.toMatchObject({ kind: 'http', status: 500, code: null });
  });

  it('fetch 자체가 실패하면 network 오류', async () => {
    const impl = (async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;
    const err = await client(impl)
      .me()
      .catch((e: unknown) => e);
    expect(isNetworkError(err)).toBe(true);
  });

  it('토큰을 붙인 요청이 401 이면 onUnauthorized 를 부른다', async () => {
    const onUnauthorized = jest.fn();
    const { impl } = fakeFetch(401, { code: 'UNAUTHORIZED', message: 'expired' });
    await expect(client(impl, { getToken: () => 'old', onUnauthorized }).me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('로그인 시도(토큰 없음)의 401 은 로그아웃 처리하지 않는다', async () => {
    const onUnauthorized = jest.fn();
    const { impl } = fakeFetch(401, { code: 'UNAUTHORIZED', message: 'bad password' });
    await expect(client(impl, { onUnauthorized }).login('a@b.co', 'x')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('toUserMessage: 사용자 문구', () => {
  it('상황별 한국어 문구', () => {
    expect(toUserMessage(new ApiError('http', 409, 'EMAIL_TAKEN', ''), 'signup')).toContain('이미 가입된');
    expect(toUserMessage(new ApiError('http', 401, 'UNAUTHORIZED', ''), 'login')).toContain('비밀번호가 맞지 않아요');
    expect(toUserMessage(new ApiError('http', 400, 'VALIDATION_ERROR', ''), 'signup')).toContain('8자 이상');
    expect(toUserMessage(new ApiError('network', 0, null, ''))).toContain('서버에 연결할 수 없어요');
    expect(toUserMessage(new Error('x'))).toContain('문제가 생겼어요');
  });
});
