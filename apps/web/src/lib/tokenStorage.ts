// 로그인 토큰(JWT) 보관
// MVP 결정: localStorage 에 저장한다. (XSS 에 취약하므로 정식 출시 전 httpOnly 쿠키 전환을 검토)
// 시크릿 모드 등으로 localStorage 를 못 쓰면 메모리에만 보관한다(새로고침하면 로그아웃).

const TOKEN_KEY = 'spn.accessToken';
let memoryToken: string | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    storage()?.setItem(TOKEN_KEY, token);
  } catch {
    // 저장 실패 시 메모리 값만 쓴다
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    storage()?.removeItem(TOKEN_KEY);
  } catch {
    // 무시
  }
}
