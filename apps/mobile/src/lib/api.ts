// [공유 로직 사본] 원본: web/src/lib/api.ts (2026-10-06 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.

// 백엔드(Java, Spring Boot) API 클라이언트
// 인증 계약 (백엔드와 합의된 형식):
//   POST /api/auth/signup {email, password(8자 이상)} → 201 {accessToken, user:{id,email}}
//   POST /api/auth/login  {email, password}           → 200 {accessToken, user:{id,email}}
//   GET  /api/me (Authorization: Bearer <token>)      → 200 {id,email}
//   오류 본문 {code, message}: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 409 EMAIL_TAKEN
//   JWT 만료 7일, refresh 없음 → 만료되면 401 을 받고 다시 로그인한다.

export interface User {
  id: string | number;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

/**
 * API 호출 실패
 * - kind 'network' : 서버에 닿지 못함(서버 꺼짐, 인터넷 끊김, 시간 초과, CORS 차단). status 는 0.
 * - kind 'http'    : 서버가 오류 상태 코드로 응답함. code 는 서버가 준 오류 코드(없으면 null).
 */
export class ApiError extends Error {
  readonly kind: 'network' | 'http';
  readonly status: number;
  readonly code: string | null;

  constructor(kind: 'network' | 'http', status: number, code: string | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.kind === 'network';
}

export interface ApiClientOptions {
  baseUrl: string;
  /** 현재 토큰을 돌려준다. 없으면 null */
  getToken: () => string | null;
  /** 토큰을 붙인 요청이 401 을 받았을 때 호출 (로그아웃 처리) */
  onUnauthorized?: () => void;
  /** 테스트에서 가짜 fetch 를 넣기 위한 자리. 기본은 전역 fetch */
  fetchImpl?: typeof fetch;
  /** 응답 대기 한도(ms). 넘으면 네트워크 오류로 본다. 기본 10초 */
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  signup(email: string, password: string): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  me(): Promise<User>;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, getToken, onUnauthorized, timeoutMs = 10_000 } = options;
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // fetch 자체가 실패 = 서버에 연결하지 못함
      throw new ApiError('network', 0, null, 'network error');
    } finally {
      clearTimeout(timer);
    }

    const data = await readJson(res);
    if (!res.ok) {
      const err = (data ?? {}) as { code?: unknown; message?: unknown };
      const code = typeof err.code === 'string' ? err.code : null;
      const message = typeof err.message === 'string' ? err.message : `HTTP ${res.status}`;
      // 토큰을 붙여 보낸 요청이 401 이면 토큰이 만료·무효인 것 → 로그아웃 처리
      // (로그인 시도 자체의 401 은 "비밀번호 틀림"이므로 로그아웃 처리하지 않는다)
      if (res.status === 401 && token) onUnauthorized?.();
      throw new ApiError('http', res.status, code, message);
    }
    return data as T;
  }

  return {
    request,
    signup: (email, password) =>
      request<AuthResponse>('/api/auth/signup', { method: 'POST', body: { email, password } }),
    login: (email, password) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } }),
    me: () => request<User>('/api/me'),
  };
}

/** 서버에 연결하지 못했을 때 공통 문구 */
export const NETWORK_ERROR_MESSAGE =
  '서버에 연결할 수 없어요. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.';

/**
 * 사용자에게 보여 줄 한국어 오류 문구
 * context 로 어떤 동작 중이었는지 알려 주면 더 알맞은 문구를 고른다.
 */
export function toUserMessage(err: unknown, context: 'login' | 'signup' | 'general' = 'general'): string {
  if (!(err instanceof ApiError)) return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  if (err.kind === 'network') return NETWORK_ERROR_MESSAGE;
  if (err.code === 'EMAIL_TAKEN' || err.status === 409) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (err.status === 401) {
    return context === 'login'
      ? '이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.'
      : '로그인이 만료됐어요. 다시 로그인해 주세요.';
  }
  if (err.code === 'VALIDATION_ERROR' || err.status === 400) {
    return context === 'signup'
      ? '입력한 내용을 확인해 주세요. 비밀번호는 8자 이상이어야 해요.'
      : '입력한 내용을 확인해 주세요.';
  }
  if (err.status >= 500) return '서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
