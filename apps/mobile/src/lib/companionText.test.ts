// [공유 로직 테스트 사본] 원본: web/src/lib/companionText.test.ts (2026-10-14 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄을 제거하고 expect(값, 메시지) 의 메시지 인자 2곳을 뺐다(jest 타입에 없음). 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import {
  COMPANION_TEXT,
  companionLines,
  companionTexts,
  findCompanionForbidden,
  withoutRecordingDays,
} from './companionText';

describe('companionLines', () => {
  it('first_time + 두 값: 함께한 줄 → 기록 줄', () => {
    expect(companionLines({ togetherDays: 120, recordingDays: 45 }, '보리', 'first_time')).toEqual([
      '보리와 함께한 지 120일째',
      '기록을 시작한 지 45일째',
    ]);
  });
  it('이름 받침에 따라 와/과', () => {
    expect(COMPANION_TEXT.together('콩이', 2)).toBe('콩이와 함께한 지 2일째');
    expect(COMPANION_TEXT.together('밤', 2)).toBe('밤과 함께한 지 2일째');
  });
  it('입양일 없음(togetherDays null): 기록 줄만', () => {
    expect(companionLines({ togetherDays: null, recordingDays: 45 }, '보리', 'first_time')).toEqual([
      '기록을 시작한 지 45일째',
    ]);
  });
  it('recordingDays 만 null: 함께한 줄만', () => {
    expect(companionLines({ togetherDays: 3, recordingDays: null }, '보리', 'first_time')).toEqual([
      '보리와 함께한 지 3일째',
    ]);
  });
  it('둘 다 null: 없음', () => {
    expect(companionLines({ togetherDays: null, recordingDays: null }, '보리', 'first_time')).toEqual([]);
  });
  it('1 은 그대로 1일째', () => {
    expect(companionLines({ togetherDays: 1, recordingDays: 1 }, '보리', 'first_time')).toEqual([
      '보리와 함께한 지 1일째',
      '기록을 시작한 지 1일째',
    ]);
  });
  it.each([0, -1, 1.5, NaN, Infinity, '3' as unknown as number])('사용할 수 없는 값 %s 은 그 줄을 생략', (bad) => {
    expect(companionLines({ togetherDays: bad, recordingDays: bad }, '보리', 'first_time')).toEqual([]);
    expect(companionLines({ togetherDays: bad, recordingDays: 2 }, '보리', 'first_time')).toEqual(['기록을 시작한 지 2일째']);
  });
  it('companion null/undefined 이면 없음', () => {
    expect(companionLines(null, '보리', 'first_time')).toEqual([]);
    expect(companionLines(undefined, '보리', 'first_time')).toEqual([]);
  });
  it.each(['senior', null, undefined])('companion 이 있어도 profileType=%s 이면 숨김', (t) => {
    expect(companionLines({ togetherDays: 5, recordingDays: 5 }, '보리', t)).toEqual([]);
  });
  it('이름이 비면 함께한 줄을 만들지 않는다', () => {
    expect(companionLines({ togetherDays: 5, recordingDays: 5 }, '', 'first_time')).toEqual(['기록을 시작한 지 5일째']);
  });
  it('기기 시계를 바꿔도 출력 불변(날짜 계산 없음)', () => {
    const a = companionLines({ togetherDays: 7, recordingDays: 3 }, '보리', 'first_time');
    const realNow = Date.now;
    Date.now = () => new Date('2030-01-01T00:00:00Z').getTime();
    try {
      expect(companionLines({ togetherDays: 7, recordingDays: 3 }, '보리', 'first_time')).toEqual(a);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('문구 금지어', () => {
  it('문구 상수 전체(샘플 출력)에 금지어가 없고 형태가 고정이다', () => {
    const texts = companionTexts();
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) {
      expect(findCompanionForbidden(t)).toBeNull();
      expect(t).toMatch(/^\S.* \d+일째$/);
    }
  });
  it('금지어 검사기는 추가어를 잡고 일째는 허용', () => {
    for (const w of ['연속 3일째', '기록 이어가기', '목표', '꾸준히', '3번째', '100%', '계속']) {
      expect(findCompanionForbidden(w)).not.toBeNull();
    }
    expect(findCompanionForbidden('기록을 시작한 지 3일째')).toBeNull();
  });
});

describe('withoutRecordingDays', () => {
  it('recordingDays 만 비우고 나머지는 그대로', () => {
    const c = { togetherDays: 7, recordingDays: 3 };
    expect(withoutRecordingDays(c)).toEqual({ togetherDays: 7, recordingDays: null });
    expect(c.recordingDays).toBe(3); // 원본 불변
    expect(companionLines(withoutRecordingDays(c), '보리', 'first_time')).toEqual(['보리와 함께한 지 7일째']);
  });
  it('null/undefined 는 그대로', () => {
    expect(withoutRecordingDays(null)).toBeNull();
    expect(withoutRecordingDays(undefined)).toBeUndefined();
  });
});
