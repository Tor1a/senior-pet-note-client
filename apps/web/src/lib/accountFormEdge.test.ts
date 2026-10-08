import { describe, expect, it } from 'vitest';
// QA 보강: accountForm 경계값과 오류 코드별 문구 (웹 apps/mobile/src/lib/accountFormEdge.test.ts 와 같은 내용)
import { ApiError } from './api';
import { classifyAccountError, utf8ByteLength, validatePasswordChange, validateWithdraw } from './accountForm';

const base = { currentPassword: 'password123', newPassword: 'abcd1234', newPasswordConfirm: 'abcd1234' };
const v = (o: Partial<typeof base>) => validatePasswordChange({ ...base, ...o });
const same = (s: string) => v({ newPassword: s, newPasswordConfirm: s });

describe('새 비밀번호 경계', () => {
  it('8자 통과, 7자 거절', () => {
    expect(same('abcd1234')).toEqual({});
    expect(same('abcd123').newPassword).toMatch(/8자 이상/);
  });
  it('공백만 8자는 통과(자르지 않는다), 앞뒤 공백 포함 길이로 센다', () => {
    expect(same('        ')).toEqual({});
    expect(same(' abcdef ')).toEqual({});
  });
  it('특수문자와 이모지 바이트 경계', () => {
    expect(same('!@#$%^&*')).toEqual({});
    expect(same('😀'.repeat(18))).toEqual({}); // 72바이트
    expect(same('😀'.repeat(19)).newPassword).toMatch(/너무 길어요/); // 76바이트
    expect(same('가'.repeat(23) + 'abc')).toEqual({}); // 72바이트
    expect(same('가'.repeat(23) + 'abcd').newPassword).toMatch(/너무 길어요/); // 73바이트
  });
  it('이모지 4개(8 UTF-16 단위)는 길이 최소를 통과한다 - 서버의 @Size(8) 도 UTF-16 단위로 센다', () => {
    expect(same('😀😀😀😀')).toEqual({});
  });
  it('현재 비밀번호가 비어 있으면 같음 검사를 하지 않는다', () => {
    const e = v({ currentPassword: '' });
    expect(e.currentPassword).toBeTruthy();
    expect(e.newPassword).toBeUndefined();
  });
  it('확인 칸이 비어 있으면 확인 칸 오류', () => {
    expect(v({ newPasswordConfirm: '' }).newPasswordConfirm).toBeTruthy();
  });
  it('utf8ByteLength: 빈 문자열, 짝 없는 서로게이트도 예외 없이 센다', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(() => utf8ByteLength('\ud83d')).not.toThrow();
  });
});

describe('validateWithdraw', () => {
  it('공백 비밀번호도 비어 있지 않으면 통과', () => {
    expect(validateWithdraw({ password: ' ', confirmed: true })).toEqual({});
  });
});

describe('오류 코드별 분류', () => {
  const http = (status: number, code: string | null, retry: number | null = null) =>
    new ApiError('http', status, code, 'x', retry);
  it('429 Retry-After 0 은 0초 잠금(null 이 아님)', () => {
    expect(classifyAccountError(http(429, 'TOO_MANY_ATTEMPTS', 0), 'password').lockSeconds).toBe(0);
  });
  it('400 VALIDATION_ERROR 는 탈퇴에서는 칸 오류가 아니다', () => {
    expect(classifyAccountError(http(400, 'VALIDATION_ERROR'), 'withdraw').field).toBeNull();
  });
  it('알 수 없는 비 ApiError 도 예외 없이 기본 분류', () => {
    const r = classifyAccountError(new Error('boom'), 'withdraw');
    expect(r.lockSeconds).toBeNull();
    expect(r.sessionExpired).toBe(false);
    expect(r.message.length).toBeGreaterThan(0);
  });
  it('403·404 같은 그 밖의 코드는 칸 오류·잠금·세션 만료가 아니다', () => {
    for (const s of [403, 404, 409]) {
      const r = classifyAccountError(http(s, 'X'), 'password');
      expect([r.field, r.lockSeconds, r.sessionExpired]).toEqual([null, null, false]);
    }
  });
});
