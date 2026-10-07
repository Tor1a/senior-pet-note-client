// [공유 로직 사본] 원본: web/src/lib/loginForm.ts (2026-10-07 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 로그인·회원가입 폼 입력 검증 (순수 함수, 테스트 대상)
// 서버도 같은 규칙으로 검사하지만, 화면에서 먼저 알려 줘서 불필요한 요청을 줄인다.

export type AuthMode = 'login' | 'signup';

/** 비밀번호 최소 길이 (백엔드 계약: 8자 이상) */
export const PASSWORD_MIN_LENGTH = 8;

export interface LoginFormValues {
  email: string;
  password: string;
  /** 회원가입 때만 확인용으로 한 번 더 입력 (비밀번호 찾기 기능이 아직 없어서 오타 방지) */
  passwordConfirm?: string;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
  passwordConfirm?: string;
}

// 느슨한 형식 검사: "무엇@무엇.무엇". 정확한 검증은 서버가 한다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginForm(values: LoginFormValues, mode: AuthMode): LoginFormErrors {
  const errors: LoginFormErrors = {};
  const email = values.email.trim();

  if (!email) errors.email = '이메일을 입력해 주세요.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = '이메일 형식을 확인해 주세요. (예: you@example.com)';

  if (!values.password) errors.password = '비밀번호를 입력해 주세요.';
  else if (mode === 'signup' && values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`;
  }

  if (mode === 'signup' && !errors.password && values.passwordConfirm !== values.password) {
    errors.passwordConfirm = '비밀번호가 서로 달라요. 한 번 더 확인해 주세요.';
  }
  return errors;
}

export function hasErrors(errors: LoginFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
