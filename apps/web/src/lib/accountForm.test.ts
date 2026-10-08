import { describe, expect, it } from 'vitest';
import { ApiError, formatWait, toUserMessage } from './api';
import {
  classifyAccountError,
  PASSWORD_MAX_BYTES,
  utf8ByteLength,
  validatePasswordChange,
  validateWithdraw,
} from './accountForm';
import { resolvePrivacyPolicyUrl } from './privacyConfig';

const ok = { currentPassword: 'password123', newPassword: 'brandNewPass1', newPasswordConfirm: 'brandNewPass1' };

describe('utf8ByteLength', () => {
  it('영문 1바이트, 한글 3바이트, 이모지 4바이트', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('가나다')).toBe(9);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('validatePasswordChange', () => {
  it('올바른 입력은 오류가 없다', () => {
    expect(validatePasswordChange(ok)).toEqual({});
  });
  it('빈 칸', () => {
    const e = validatePasswordChange({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
    expect(e.currentPassword).toBe('현재 비밀번호를 입력해 주세요.');
    expect(e.newPassword).toBe('새 비밀번호를 입력해 주세요.');
    expect(e.newPasswordConfirm).toBeUndefined();
  });
  it('8자 미만', () => {
    const e = validatePasswordChange({ ...ok, newPassword: 'short12', newPasswordConfirm: 'short12' });
    expect(e.newPassword).toBe('비밀번호는 8자 이상으로 정해 주세요.');
  });
  it('현재와 같으면 거절', () => {
    const e = validatePasswordChange({ ...ok, newPassword: 'password123', newPasswordConfirm: 'password123' });
    expect(e.newPassword).toContain('지금 쓰는 비밀번호와 같아요');
  });
  it('확인이 다르면 확인 칸 오류, 새 비밀번호 오류가 있으면 확인 오류는 내지 않는다', () => {
    expect(validatePasswordChange({ ...ok, newPasswordConfirm: 'other-pass-1' }).newPasswordConfirm).toBe(
      '비밀번호가 서로 달라요. 한 번 더 확인해 주세요.',
    );
    const e = validatePasswordChange({ ...ok, newPassword: 'abc', newPasswordConfirm: 'x' });
    expect(e.newPasswordConfirm).toBeUndefined();
  });
  it('72바이트: 영문 72자 통과, 73자 거절', () => {
    const a72 = 'a'.repeat(72);
    expect(validatePasswordChange({ ...ok, newPassword: a72, newPasswordConfirm: a72 })).toEqual({});
    const a73 = 'a'.repeat(73);
    expect(validatePasswordChange({ ...ok, newPassword: a73, newPasswordConfirm: a73 }).newPassword).toContain('너무 길어요');
  });
  it('72바이트: 한글 24자 통과, 25자 거절', () => {
    const k24 = '가'.repeat(24);
    expect(utf8ByteLength(k24)).toBe(PASSWORD_MAX_BYTES);
    expect(validatePasswordChange({ ...ok, newPassword: k24, newPasswordConfirm: k24 })).toEqual({});
    const k25 = '가'.repeat(25);
    expect(validatePasswordChange({ ...ok, newPassword: k25, newPasswordConfirm: k25 }).newPassword).toContain('한글은 24자');
  });
  it('공백은 자르지 않는다', () => {
    const e = validatePasswordChange({ ...ok, newPassword: '        ', newPasswordConfirm: '        ' });
    expect(e).toEqual({});
  });
});

describe('validateWithdraw', () => {
  it('둘 다 비면 둘 다 오류', () => {
    expect(validateWithdraw({ password: '', confirmed: false })).toEqual({
      password: '비밀번호를 입력해 주세요.',
      confirmed: '내용을 읽었다면 체크해 주세요.',
    });
  });
  it('통과', () => {
    expect(validateWithdraw({ password: 'x', confirmed: true })).toEqual({});
  });
});

const http = (status: number, code: string | null, retry: number | null = null) =>
  new ApiError('http', status, code, 'm', retry);

describe('classifyAccountError', () => {
  it('400 CURRENT_PASSWORD_MISMATCH: 칸 오류, 로그아웃(세션 만료) 아님', () => {
    const r = classifyAccountError(http(400, 'CURRENT_PASSWORD_MISMATCH'), 'password');
    expect(r.field).toBe('current');
    expect(r.clearPassword).toBe(true);
    expect(r.sessionExpired).toBe(false);
    expect(r.message).toBe('현재 비밀번호가 맞지 않아요. 다시 확인해 주세요.');
    expect(classifyAccountError(http(400, 'CURRENT_PASSWORD_MISMATCH'), 'withdraw').message).toBe(
      '비밀번호가 맞지 않아요. 다시 확인해 주세요.',
    );
  });
  it('400 VALIDATION_ERROR (비밀번호 변경): 새 비밀번호 칸', () => {
    const r = classifyAccountError(http(400, 'VALIDATION_ERROR'), 'password');
    expect(r.field).toBe('new');
    expect(r.message).toContain('새 비밀번호를 사용할 수 없어요');
  });
  it('401 은 세션 만료', () => {
    const r = classifyAccountError(http(401, 'UNAUTHORIZED'), 'withdraw');
    expect(r.sessionExpired).toBe(true);
    expect(r.message).toBe('로그인이 만료됐어요. 다시 로그인해 주세요.');
  });
  it('429: Retry-After 만큼 잠그고 문구에 시간이 들어간다', () => {
    const r = classifyAccountError(http(429, 'TOO_MANY_ATTEMPTS', 900), 'withdraw');
    expect(r.lockSeconds).toBe(900);
    expect(r.message).toBe('비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.');
    expect(r.sessionExpired).toBe(false);
  });
  it('429 인데 Retry-After 를 못 읽으면 1분 잠그고 시간 없는 문구', () => {
    const r = classifyAccountError(http(429, 'TOO_MANY_ATTEMPTS'), 'password');
    expect(r.lockSeconds).toBe(60);
    expect(r.message).toBe('비밀번호를 여러 번 틀렸어요. 잠시 뒤에 다시 시도해 주세요.');
  });
  it('네트워크: 탈퇴는 "끝났는지 확인하지 못했어요"', () => {
    const r = classifyAccountError(new ApiError('network', 0, null, 'x'), 'withdraw');
    expect(r.note).toBe('탈퇴가 끝났는지 확인하지 못했어요. 계정은 아직 그대로일 수 있어요.');
  });
  it('500: 탈퇴는 그대로 있어요, 비밀번호는 바뀌지 않았어요', () => {
    expect(classifyAccountError(http(500, 'INTERNAL_ERROR'), 'withdraw').note).toBe(
      '탈퇴가 끝나지 않았어요. 계정과 기록은 그대로 있어요.',
    );
    expect(classifyAccountError(http(500, 'INTERNAL_ERROR'), 'password').note).toBe('비밀번호는 바뀌지 않았어요.');
  });
});

describe('formatWait / toUserMessage', () => {
  it('60초 이하는 초, 넘으면 올림한 분', () => {
    expect(formatWait(10)).toBe('10초');
    expect(formatWait(60)).toBe('60초');
    expect(formatWait(61)).toBe('2분');
    expect(formatWait(null)).toBeNull();
  });
  it('기존 컨텍스트의 401 문구는 그대로', () => {
    expect(toUserMessage(http(401, 'UNAUTHORIZED'), 'login')).toBe('이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.');
  });
});

describe('resolvePrivacyPolicyUrl', () => {
  it('비었거나 http(s) 가 아니면 null', () => {
    expect(resolvePrivacyPolicyUrl(undefined)).toBeNull();
    expect(resolvePrivacyPolicyUrl('  ')).toBeNull();
    expect(resolvePrivacyPolicyUrl('javascript:alert(1)')).toBeNull();
    expect(resolvePrivacyPolicyUrl('not a url')).toBeNull();
  });
  it('https 주소는 그대로', () => {
    expect(resolvePrivacyPolicyUrl(' https://example.com/privacy ')).toBe('https://example.com/privacy');
  });
});
