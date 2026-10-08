// 계정 API (계약: senior-pet-note-api/docs/api-account.md)
//   PUT  /api/me/password  {currentPassword,newPassword} → 200 {accessToken}  (이전 토큰은 모두 401 → 응답 토큰으로 즉시 교체)
//   POST /api/me/withdraw  {password, confirm:true}      → 204  (계정·데이터 즉시 영구 삭제)
//   오류: 400 VALIDATION_ERROR / CURRENT_PASSWORD_MISMATCH(401 아님), 401 UNAUTHORIZED, 429 TOO_MANY_ATTEMPTS(Retry-After 초), 500 INTERNAL_ERROR
// 순수 TS(모바일 사본 대상).
import type { ApiClient } from './api';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  accessToken: string;
}

export function createAccountApi(client: ApiClient) {
  return {
    changePassword: (input: ChangePasswordInput) =>
      client.request<ChangePasswordResponse>('/api/me/password', { method: 'PUT', body: input }),
    /** confirm 은 "지워지는 내용을 확인했어요" 체크 값. 서버가 true 를 요구한다 */
    withdraw: (password: string) =>
      client.request<null>('/api/me/withdraw', { method: 'POST', body: { password, confirm: true } }),
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;
