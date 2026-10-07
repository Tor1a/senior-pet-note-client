// [공유 로직 테스트 사본] 원본: web/src/lib/todayForm.test.ts (2026-10-07 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import type { TodayResponse } from './petApi';
import {
  buildDailyLogBody,
  initialTodayForm,
  sanitizeMlInput,
  sanitizeWeightInput,
  stepWeight,
  tapLevel,
  validateTodayForm,
} from './todayForm';

// 계약서 3장 예시
const TODAY: TodayResponse = {
  recordDate: '2026-10-06',
  cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
  doses: [],
  dailyLog: null,
  suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
  lastWeight: { weightKg: 4.4, recordDate: '2026-10-03' },
};

describe('오늘 화면 입력 상태', () => {
  it('제안값은 suggested, 체중은 저장하지 않는 상태로 시작한다', () => {
    const f = initialTodayForm(TODAY);
    expect(f.food).toEqual({ value: 2, source: 'suggested' });
    expect(f.weight).toEqual({ text: '4.35', measured: false, suggested: true });
    expect(buildDailyLogBody(f).weightKg).toBeNull();
  });

  it('3단 버튼: 제안값을 누르면 확정, 확정값을 다시 누르면 해제', () => {
    const confirmed = tapLevel({ value: 2, source: 'suggested' }, 2);
    expect(confirmed).toEqual({ value: 2, source: 'confirmed' });
    expect(tapLevel(confirmed, 2)).toEqual({ value: null, source: 'empty' });
    expect(tapLevel(confirmed, 3)).toEqual({ value: 3, source: 'confirmed' });
  });

  it('물 ml 모드면 waterLevel 은 null 로 보낸다', () => {
    const f = { ...initialTodayForm(TODAY), waterMode: 'ml' as const, waterMl: { text: '350', source: 'confirmed' as const } };
    expect(buildDailyLogBody(f)).toMatchObject({ waterLevel: null, waterMl: 350 });
  });

  it('체중 스테퍼와 범위 검사', () => {
    expect(stepWeight('4.35', 0.1)).toBe('4.45');
    expect(stepWeight('4.2', -0.1)).toBe('4.1');
    expect(stepWeight('', 0.1)).toBe('');
    const f = initialTodayForm(TODAY);
    expect(validateTodayForm({ ...f, weight: { text: '250', measured: true, suggested: false } })).toContain('체중');
    expect(validateTodayForm({ ...f, waterMode: 'ml', waterMl: { text: '30000', source: 'confirmed' } })).toContain('물');
    expect(validateTodayForm(f)).toBeNull();
  });
});

describe('입력 보정', () => {
  it('체중: 쉼표는 점으로 바꾼다("4,35" → "4.35")', () => {
    expect(sanitizeWeightInput('4,35')).toBe('4.35');
  });

  it('체중: 점은 첫 개만 남긴다', () => {
    expect(sanitizeWeightInput('4.3.5')).toBe('4.35');
    expect(sanitizeWeightInput('4,3.5')).toBe('4.35');
  });

  it('체중: 숫자·점 외 문자는 지운다', () => {
    expect(sanitizeWeightInput('4a.3kg')).toBe('4.3');
    expect(sanitizeWeightInput('-5')).toBe('5');
  });

  it('체중: 빈 문자열과 앞자리 점', () => {
    expect(sanitizeWeightInput('')).toBe('');
    expect(sanitizeWeightInput('.5')).toBe('.5');
    expect(sanitizeWeightInput(',5')).toBe('.5');
  });

  it('ml: 숫자만 남긴다', () => {
    expect(sanitizeMlInput('3a5,0.')).toBe('350');
    expect(sanitizeMlInput('')).toBe('');
  });
});
