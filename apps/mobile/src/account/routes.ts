// 계정 화면들의 경로와 화면 사이 안내 코드 (설계 2장)
// - 라우트: /account, /account/password, /account/delete
// - 비밀번호를 바꾸고 돌아올 때는 파라미터 notice 에 고정 키(password)만 싣는다(임의 문구를 주소에 싣지 않는다).
export const ACCOUNT_HREF = '/account';
export const PASSWORD_HREF = '/account/password';
export const DELETE_ACCOUNT_HREF = '/account/delete';

export function isPasswordNotice(v: unknown): boolean {
  return v === 'password';
}
