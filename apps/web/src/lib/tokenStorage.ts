// 로그인 토큰(JWT) 보관
// MVP 결정: localStorage 에 저장한다. (XSS 에 취약하므로 정식 출시 전 httpOnly 쿠키 전환을 검토)
// 시크릿 모드 등으로 localStorage 를 못 쓰면 메모리에만 보관한다(새로고침하면 로그아웃).
// 알림 버튼([먹였어요])을 서비스워커가 처리하려면 토큰이 필요한데 서비스워커는 localStorage 를 못 읽는다.
// 그래서 토큰 사본을 IndexedDB 에 둔다(swTokenStore.ts). 저장·교체·삭제는 반드시 이 파일의 setToken/clearToken 을 지나게 해서
// 로그아웃·401 강제 로그아웃·탈퇴·비밀번호 변경 후 토큰 교체·다른 계정 로그인에서 사본이 어긋나지 않게 한다.
// 사본의 수명은 localStorage 토큰 이하여야 한다: localStorage 를 못 쓰는 메모리 토큰 모드에서는 사본을 쓰지 않고(있으면 지운다),
// 저장은 "그 시점 localStorage 값과 같을 때만" 한다(탭 경합으로 로그아웃 뒤에 사본이 되살아나지 않게).
import { clearSwToken, saveSwToken, swTokenSettled } from './swTokenStore';

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

/** localStorage 에 저장된 로그인 토큰(메모리 값은 제외). 사본이 따라야 하는 "진짜" 값이다 */
function storedToken(): string | null {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 마지막 사본 삭제의 진행 상태: none(삭제한 적 없음) / pending / ok / failed */
let clearState: 'none' | 'pending' | 'ok' | 'failed' = 'none';
let clearSeq = 0;

/** 사본 삭제를 시작하고 결과를 기록한다. stillCleared 는 swTokenStore.clearSwToken 참고 */
function dropSwCopy(stillCleared?: () => boolean): void {
  const seq = (clearSeq += 1);
  clearState = 'pending';
  void clearSwToken(stillCleared).then((result) => {
    if (seq === clearSeq) clearState = result === 'failed' ? 'failed' : 'ok';
  });
}

export function setToken(token: string): void {
  memoryToken = token;
  let persisted = false;
  try {
    const store = storage();
    if (store) {
      store.setItem(TOKEN_KEY, token);
      persisted = true;
    }
  } catch {
    // 저장 실패 시 메모리 값만 쓴다
  }
  if (persisted) {
    // 다른 탭이 그사이 로그아웃·교체했다면 낡은 토큰으로 사본을 되살리지 않는다(쓰기 트랜잭션 안에서 localStorage 와 같을 때만 저장)
    void saveSwToken(token, () => storedToken() === token);
  } else {
    // 메모리 토큰 모드(localStorage 불가): 토큰은 새로고침하면 사라지는데 사본이 남으면 토큰보다 오래 산다 → 사본을 쓰지 않고 있으면 지운다
    dropSwCopy();
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    storage()?.removeItem(TOKEN_KEY);
  } catch {
    // 무시
  }
  dropSwCopy();
}

/**
 * 앱 시작 때 서비스워커 사본을 현재 로그인 상태에 맞춘다(localStorage 에 토큰이 없으면 사본 삭제, 있으면 같은 값으로 저장).
 * 옛 버전에서 로그인한 기기에도 사본이 생긴다. 낡은 탭의 시작 정리가 다른 탭의 로그아웃·새 로그인과 어긋나지 않도록
 * 저장·삭제 모두 트랜잭션 안에서 그 시점의 localStorage 값을 다시 확인한다. 메모리 토큰 모드에서는 사본을 쓰지 않는다.
 */
export function syncSwTokenCopy(): void {
  const token = storedToken();
  if (token) void saveSwToken(token, () => storedToken() === token);
  else dropSwCopy(() => storedToken() === null);
}

/**
 * 사본 변경이 끝나길 잠깐 기다린다(로그아웃·탈퇴 직후 화면을 넘기기 전, 최대 1초).
 * 돌려주는 값: 마지막 사본 삭제가 확인됐는지(삭제 실패 또는 시간 초과면 false). 호출한 쪽은 이 값 때문에 로그아웃을 멈추지 않는다.
 */
export async function swTokenCopySettled(): Promise<boolean> {
  await swTokenSettled();
  return clearState === 'none' || clearState === 'ok';
}
