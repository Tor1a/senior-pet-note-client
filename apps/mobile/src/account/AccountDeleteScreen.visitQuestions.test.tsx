import { findPrivacyForbidden } from '../lib/privacyText';
import { SCOPE_ITEMS } from './AccountDeleteScreen';

// 탈퇴 화면(모바일) 삭제 범위에 진료 때 물어볼 것이 들어 있다 (웹 DeleteAccountGuidePage/AccountDeletePage 와 같은 문구)
jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

describe('모바일 탈퇴 화면 — 진료 때 물어볼 것', () => {
  it('삭제 범위에 직접 적은 진료 때 물어볼 것 항목이 할 일 항목 바로 뒤에 있다', () => {
    const at = SCOPE_ITEMS.indexOf('직접 적은 진료 때 물어볼 것(글과 물어봤어요 표시)');
    expect(at).toBeGreaterThan(0);
    expect(SCOPE_ITEMS[at - 1]).toContain('할 일 일정');
    expect(SCOPE_ITEMS.at(-1)).toBe('알림을 받던 기기 연결(이 휴대폰과 다른 기기 모두)');
  });

  it('금칙어가 없다', () => {
    for (const item of SCOPE_ITEMS) expect({ item, hit: findPrivacyForbidden(item) }).toEqual({ item, hit: null });
  });
});
