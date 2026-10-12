import { describe, expect, it } from 'vitest';
import { DELETE_GUIDE_TEXT, deleteGuideTexts, isValidSupportEmail, resolveDeleteGuide } from './deleteGuide';
import { findPrivacyForbidden } from './privacyText';

describe('계정 삭제 안내 문구·환경변수', () => {
  it('고정 문구에 금지 표현과 "확인 필요" 같은 미정 표시가 없다', () => {
    for (const text of deleteGuideTexts()) {
      expect(findPrivacyForbidden(text)).toBeNull();
      expect(text).not.toMatch(/확인 필요|TODO|미정/);
    }
  });

  it('비어 있는 값은 모두 null 이다', () => {
    expect(resolveDeleteGuide({})).toEqual({
      operatorName: null,
      supportEmail: null,
      privacyUrl: null,
      retentionNote: null,
      deleteRequestNote: null,
    });
    expect(resolveDeleteGuide({ VITE_SUPPORT_EMAIL: '  ', VITE_OPERATOR_NAME: '' })).toMatchObject({
      supportEmail: null,
      operatorName: null,
    });
  });

  it('값이 있으면 앞뒤 공백을 자르고, 형식이 틀린 이메일·주소는 버린다', () => {
    const ok = resolveDeleteGuide({
      VITE_SUPPORT_EMAIL: ' help@example.com ',
      VITE_OPERATOR_NAME: ' 홍길동 ',
      VITE_PRIVACY_POLICY_URL: 'https://example.com/privacy',
      VITE_RETENTION_NOTE: '백업은 30일 뒤 지워져요.',
      VITE_DELETE_REQUEST_NOTE: ' 가입한 이메일로 보내 주세요. ',
    });
    expect(ok).toEqual({
      operatorName: '홍길동',
      supportEmail: 'help@example.com',
      privacyUrl: 'https://example.com/privacy',
      retentionNote: '백업은 30일 뒤 지워져요.',
      deleteRequestNote: '가입한 이메일로 보내 주세요.',
    });
    const bad = resolveDeleteGuide({ VITE_SUPPORT_EMAIL: 'not-an-email', VITE_PRIVACY_POLICY_URL: 'javascript:alert(1)' });
    expect(bad.supportEmail).toBeNull();
    expect(bad.privacyUrl).toBeNull();
  });
});

describe('QA 보강: 환경변수가 빌드에 비어 들어간 경우', () => {
  it('값이 undefined, 빈 문자열, 공백, 탭/개행뿐이어도 전부 null 이고 예외가 없다', () => {
    for (const v of [undefined, '', ' ', '\t\n ']) {
      expect(resolveDeleteGuide({ VITE_SUPPORT_EMAIL: v, VITE_OPERATOR_NAME: v, VITE_PRIVACY_POLICY_URL: v, VITE_RETENTION_NOTE: v, VITE_DELETE_REQUEST_NOTE: v })).toEqual({
        operatorName: null,
        supportEmail: null,
        privacyUrl: null,
        retentionNote: null,
        deleteRequestNote: null,
      });
    }
  });
  it('vite 가 주는 env 객체(다른 키 포함)를 그대로 넘겨도 된다', () => {
    expect(() => resolveDeleteGuide({ MODE: 'production', BASE_URL: '/', VITE_API_BASE_URL: '' } as never)).not.toThrow();
  });
  it('처리방침 주소는 http(s) 만 받는다 (mailto:, ftp:, 상대경로, javascript:, data: 는 버림)', () => {
    for (const u of ['mailto:a@b.c', 'ftp://x.com', '/privacy', 'javascript:alert(1)', 'data:text/html,hi', 'example.com/privacy']) {
      expect(resolveDeleteGuide({ VITE_PRIVACY_POLICY_URL: u }).privacyUrl).toBeNull();
    }
    expect(resolveDeleteGuide({ VITE_PRIVACY_POLICY_URL: 'http://example.com/p' }).privacyUrl).toBe('http://example.com/p');
  });
  it('findPrivacyForbidden 은 금지 목록 18개 전부를 잡고, "14세 이상"만 예외다', () => {
    const words = ['이상', '위험', '진단', '정상', '경고', '주의', '악화', '호전', '좋아', '나빠', '늘었', '줄었', '증가', '감소', '준수', '순응', '퍼센트', '%'];
    for (const w of words) expect(findPrivacyForbidden(`앞 ${w} 뒤`)).toBe(w);
    expect(findPrivacyForbidden('만 14세 이상입니다.')).toBeNull();
    expect(findPrivacyForbidden('만 14세 이상이면 이상해요')).toBe('이상');
  });
});

describe('후속 조치: 이메일 형식·삭제 범위 문구', () => {
  it('정상 주소는 통과하고, 쿼리·구분 문자가 있으면 버린다', () => {
    for (const ok of ['a.b+tag@sub.example.co.kr', 'help@example.com']) {
      expect(resolveDeleteGuide({ VITE_SUPPORT_EMAIL: ok }).supportEmail).toBe(ok);
      expect(isValidSupportEmail(ok)).toBe(true);
    }
    for (const bad of ['help@example.com?subject=hi', 'a@b.com&bcc=x', 'a,b@example.com', 'a@b.com,c@d.com', 'a%40b@example.com', 'a@b.com;c@d.com', 'a@b.com#x', '', undefined, 'nope']) {
      expect(resolveDeleteGuide({ VITE_SUPPORT_EMAIL: bad }).supportEmail).toBeNull();
      expect(isValidSupportEmail(bad)).toBe(false);
    }
  });
  it('삭제 범위: DB 즉시 삭제·사진 이어서 삭제로 한정하고 되돌릴 수 없다는 말은 유지, 포괄 항목이 있다', () => {
    const t = DELETE_GUIDE_TEXT;
    expect(t.periodBody).toBe('서비스 데이터베이스에서는 즉시 삭제해요. 사진 파일은 이어서 지워요.');
    expect(t.dataNote2).toBe('한 번 삭제하면 되돌릴 수 없어요.');
    expect(t.dataItems.at(-1)).toBe('그 밖에 서비스 이용 중 쌓인 데이터(이용 기록, 알림 발송 기록 등)');
    expect(deleteGuideTexts().join('\n')).not.toContain('바로 삭제');
  });
});
