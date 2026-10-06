// 백엔드(Java, Spring Boot) API 클라이언트
// 인증 계약 (백엔드와 합의된 형식):
//   POST /api/auth/signup {email, password(8자 이상)} → 201 {accessToken, user:{id,email}}
//   POST /api/auth/login  {email, password}           → 200 {accessToken, user:{id,email}}
//   GET  /api/me (Authorization: Bearer <token>)      → 200 {id,email}
//   오류 본문 {code, message}: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 409 EMAIL_TAKEN
//   JWT 만료 7일, refresh 없음 → 만료되면 401 을 받고 다시 로그인한다.
// 반려동물·투약·오늘 화면 API 는 petApi.ts (계약: docs/api-today.md)

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
  /** JSON 으로 보낼 값. FormData 면 multipart 로 그대로 보낸다(사진 업로드) */
  body?: unknown;
  /** true 면 401 을 받아도 로그아웃 처리하지 않는다(지표 이벤트처럼 화면에 영향을 주면 안 되는 요청) */
  ignoreUnauthorized?: boolean;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  /** 바이너리 응답(사진)을 Blob 으로 받는다 */
  requestBlob(path: string): Promise<Blob>;
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

  /** 공통 요청. 성공하면 Response 를, 실패하면 ApiError 를 던진다 */
  async function send(
    path: string,
    { method = 'GET', body, ignoreUnauthorized = false }: RequestOptions,
    accept: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: accept };
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    // FormData 는 브라우저가 boundary 를 붙여 Content-Type 을 정하므로 직접 넣지 않는다
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // fetch 자체가 실패 = 서버에 연결하지 못함
      throw new ApiError('network', 0, null, 'network error');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const data = await readJson(res);
      const err = (data ?? {}) as { code?: unknown; message?: unknown };
      const code = typeof err.code === 'string' ? err.code : null;
      const message = typeof err.message === 'string' ? err.message : `HTTP ${res.status}`;
      // 토큰을 붙여 보낸 요청이 401 이면 토큰이 만료·무효인 것 → 로그아웃 처리
      // (로그인 시도 자체의 401 은 "비밀번호 틀림"이므로 로그아웃 처리하지 않는다)
      if (res.status === 401 && token && !ignoreUnauthorized) onUnauthorized?.();
      throw new ApiError('http', res.status, code, message);
    }
    return res;
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await send(path, opts, 'application/json');
    return (await readJson(res)) as T;
  }

  async function requestBlob(path: string): Promise<Blob> {
    const res = await send(path, {}, 'image/*');
    return res.blob();
  }

  return {
    request,
    requestBlob,
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

/** 오류 문구를 고를 때 쓰는 "무엇을 하던 중이었나" */
export type ErrorContext =
  | 'login'
  | 'signup'
  | 'general'
  | 'pet'
  | 'photo'
  | 'medication'
  | 'medLog'
  | 'dailyLog';

/**
 * 사용자에게 보여 줄 한국어 오류 문구
 * context 로 어떤 동작 중이었는지 알려 주면 더 알맞은 문구를 고른다.
 */
export function toUserMessage(err: unknown, context: ErrorContext = 'general'): string {
  if (!(err instanceof ApiError)) return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  if (err.kind === 'network') return NETWORK_ERROR_MESSAGE;
  if (err.code === 'EMAIL_TAKEN') return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (err.status === 401) {
    return context === 'login'
      ? '이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.'
      : '로그인이 만료됐어요. 다시 로그인해 주세요.';
  }
  if (err.code === 'FILE_TOO_LARGE' || err.status === 413) return '사진이 너무 커요. 5MB 이하 사진을 골라 주세요.';
  if (err.code === 'INVALID_FILE') return 'JPG, PNG, WEBP 사진만 올릴 수 있어요.';
  if (err.code === 'INVALID_RECORD_DATE') return '기록 날짜가 바뀌었어요. 화면을 새로 불러왔으니 다시 저장해 주세요.';
  if (err.code === 'PET_LIMIT_REACHED') return '반려동물은 한 마리만 등록할 수 있어요.';
  if (err.code === 'ALREADY_CHECKED') return '이미 체크한 약이에요.';
  if (err.status === 409) {
    return context === 'signup' || context === 'login'
      ? '이미 가입된 이메일이에요. 로그인해 주세요.'
      : '이미 처리된 요청이에요. 화면을 새로 불러와 주세요.';
  }
  if (err.code === 'VALIDATION_ERROR' || err.status === 400) {
    switch (context) {
      case 'signup':
        return '입력한 내용을 확인해 주세요. 비밀번호는 8자 이상이어야 해요.';
      case 'pet':
        return '입력한 내용을 확인해 주세요. 이름은 1~30자, 태어난 해는 1980년 이후, 질환은 200자까지 적을 수 있어요.';
      case 'medication':
        return '입력한 내용을 확인해 주세요. 약 이름은 1~50자, 시각은 1~3개이고 서로 달라야 해요.';
      case 'medLog':
        return '약 일정이 바뀐 것 같아요. 화면을 새로 불러왔어요.';
      case 'dailyLog':
        return '입력한 내용을 확인해 주세요. 체중은 0보다 크고 200kg보다 작게, 물은 0~20000ml로 적을 수 있어요.';
      default:
        return '입력한 내용을 확인해 주세요.';
    }
  }
  if (err.status === 404) return '정보를 찾지 못했어요. 화면을 새로 불러와 주세요.';
  if (err.status >= 500) return '서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
