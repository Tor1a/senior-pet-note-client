// [공유 로직 사본] 원본: web/src/lib/accountForm.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 비밀번호 변경·회원 탈퇴 폼 검증과 오류 분류 (순수 함수, 테스트 대상)
// 기준: .company/design/계정-관리-탈퇴.md 4-3·4-4·5-4·5-6, 계약 docs/api-account.md
import { ApiError, toUserMessage } from './api';
import { PASSWORD_MIN_LENGTH } from './loginForm';

/** 서버 한계: BCrypt 72바이트(UTF-8). 영문·숫자 72자, 한글 24자 */
export const PASSWORD_MAX_BYTES = 72;

/** 문자열의 UTF-8 바이트 수 (TextEncoder 없이 계산해 어떤 환경에서도 같다) */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export interface PasswordChangeValues {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}

export interface PasswordChangeErrors {
  currentPassword?: string;
  newPassword?: string;
  newPasswordConfirm?: string;
}

/** 공백은 자르지 않는다(비밀번호에 공백이 있을 수 있다). 검사 순서: 현재 → 새 → 확인 */
export function validatePasswordChange(values: PasswordChangeValues): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!values.currentPassword) errors.currentPassword = '현재 비밀번호를 입력해 주세요.';

  if (!values.newPassword) errors.newPassword = '새 비밀번호를 입력해 주세요.';
  else if (values.newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`;
  } else if (utf8ByteLength(values.newPassword) > PASSWORD_MAX_BYTES) {
    errors.newPassword = '비밀번호가 너무 길어요. 영문·숫자는 72자, 한글은 24자까지 쓸 수 있어요.';
  } else if (values.currentPassword && values.newPassword === values.currentPassword) {
    errors.newPassword = '지금 쓰는 비밀번호와 같아요. 다른 비밀번호로 정해 주세요.';
  }

  if (!errors.newPassword && values.newPasswordConfirm !== values.newPassword) {
    errors.newPasswordConfirm = '비밀번호가 서로 달라요. 한 번 더 확인해 주세요.';
  }
  return errors;
}

export interface WithdrawValues {
  password: string;
  confirmed: boolean;
}

export interface WithdrawErrors {
  password?: string;
  confirmed?: string;
}

export function validateWithdraw(values: WithdrawValues): WithdrawErrors {
  const errors: WithdrawErrors = {};
  if (!values.password) errors.password = '비밀번호를 입력해 주세요.';
  if (!values.confirmed) errors.confirmed = '내용을 읽었다면 체크해 주세요.';
  return errors;
}

export function hasFormErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/** 서버 오류를 화면이 쓰기 좋게 나눈 결과 */
export interface AccountFailure {
  /** 안내 카드(또는 칸 아래)에 보일 문구 */
  message: string;
  /** 안내 카드 아래 덧붙일 한 줄(상태가 어떤지) */
  note: string | null;
  /** 어느 칸의 오류인지. null 이면 안내 카드 */
  field: 'current' | 'new' | null;
  /** 비밀번호 칸을 비워야 하는지(비밀번호 불일치) */
  clearPassword: boolean;
  /** 429: 폼을 잠글 초. 아니면 null */
  lockSeconds: number | null;
  /** 401: 세션 만료. 강제 로그아웃은 api 클라이언트가 이미 처리했다 */
  sessionExpired: boolean;
}

/**
 * 비밀번호 변경·탈퇴 실패를 분류한다.
 * 400 CURRENT_PASSWORD_MISMATCH 는 로그아웃이 아니라 칸 오류, 429 는 폼 잠금, 401 만 세션 만료다.
 */
export function classifyAccountError(err: unknown, kind: 'password' | 'withdraw'): AccountFailure {
  const message = toUserMessage(err, kind);
  const base: AccountFailure = {
    message,
    note: null,
    field: null,
    clearPassword: false,
    lockSeconds: null,
    sessionExpired: false,
  };
  if (!(err instanceof ApiError)) return base;

  if (err.kind === 'network') {
    return {
      ...base,
      note:
        kind === 'withdraw'
          ? '탈퇴가 끝났는지 확인하지 못했어요. 계정은 아직 그대로일 수 있어요.'
          : '입력한 내용은 그대로 두었어요. 혹시 이미 바뀌었다면 새 비밀번호로 다시 시도해 주세요.',
    };
  }
  if (err.status === 401) return { ...base, sessionExpired: true };
  if (err.code === 'CURRENT_PASSWORD_MISMATCH') {
    return { ...base, field: 'current', clearPassword: true };
  }
  if (err.status === 429 || err.code === 'TOO_MANY_ATTEMPTS') {
    // Retry-After 를 못 읽으면(헤더 노출 안 됨 등) 한 번에 15분 잠근 것으로 보지 않고 1분만 잠근다
    return { ...base, lockSeconds: err.retryAfterSec ?? 60 };
  }
  if (err.status >= 500) {
    return {
      ...base,
      note:
        kind === 'withdraw'
          ? '탈퇴가 끝나지 않았어요. 계정과 기록은 그대로 있어요.'
          : '비밀번호는 바뀌지 않았어요.',
    };
  }
  if (kind === 'password' && (err.code === 'VALIDATION_ERROR' || err.status === 400)) {
    return { ...base, field: 'new' };
  }
  return base;
}
