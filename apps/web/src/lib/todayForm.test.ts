import { describe, expect, it } from 'vitest';
import { formatRecordDate, formatTakenAt, formatTime, withParticle } from './format';
import type { TodayResponse } from './petApi';
import { validatePhoto } from './photo';
import { buildDailyLogBody, initialTodayForm, stepWeight, tapLevel, validateTodayForm } from './todayForm';

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

describe('표시 형식', () => {
  it('날짜·시각', () => {
    expect(formatRecordDate('2026-10-06')).toBe('10월 6일 (화)');
    expect(formatTime('08:00')).toBe('오전 8:00');
    expect(formatTime('20:30')).toBe('오후 8:30');
    expect(formatTime('00:15')).toBe('오전 12:15');
    expect(formatTakenAt('2026-10-05T23:05:00Z')).toBe('8:05');
  });

  it('받침에 따라 조사', () => {
    expect(withParticle('보리', '와', '과')).toBe('보리와');
    expect(withParticle('콩떡', '와', '과')).toBe('콩떡과');
  });
});

describe('사진 확인', () => {
  it('형식·5MB 제한', () => {
    expect(validatePhoto({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(validatePhoto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toContain('5MB');
    expect(validatePhoto({ type: 'image/gif', size: 10 })).toContain('JPG');
  });
});
