// [공유 로직 테스트 사본] 원본: web/src/lib/format.test.ts (2026-10-07 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { ageText, daysBetween, formatKg, formatRecordDate, formatTakenAt, formatTime, withParticle } from './format';

describe('표시 형식', () => {
  it('formatRecordDate: 달력 그대로(월·일·요일)', () => {
    expect(formatRecordDate('2026-10-06')).toBe('10월 6일 (화)');
    expect(formatRecordDate('2026-01-01')).toBe('1월 1일 (목)');
    expect(formatRecordDate('2024-02-29')).toBe('2월 29일 (목)');
  });

  it('formatTime: 오전/오후, 0시·12시', () => {
    expect(formatTime('08:00')).toBe('오전 8:00');
    expect(formatTime('20:30')).toBe('오후 8:30');
    expect(formatTime('00:15')).toBe('오전 12:15');
    expect(formatTime('12:00')).toBe('오후 12:00');
    expect(formatTime('23:59')).toBe('오후 11:59');
  });

  it('formatTakenAt: 한국 시각 H:mm, 잘못된 값은 빈 문자열', () => {
    expect(formatTakenAt('2026-10-05T23:05:00Z')).toBe('8:05');
    expect(formatTakenAt('2026-10-05T15:00:00Z')).toBe('0:00');
    expect(formatTakenAt('not-a-date')).toBe('');
  });

  it('formatKg: 불필요한 0 제거, 소수 둘째 자리까지', () => {
    expect(formatKg(4.4)).toBe('4.4');
    expect(formatKg(4)).toBe('4');
    expect(formatKg(4.355)).toBe('4.36');
    expect(formatKg(4.35)).toBe('4.35');
  });

  it('withParticle: 받침 유무에 따라 조사', () => {
    expect(withParticle('보리', '와', '과')).toBe('보리와');
    expect(withParticle('콩떡', '와', '과')).toBe('콩떡과');
    expect(withParticle('Max', '와', '과')).toBe('Max와');
  });

  it('daysBetween: 달력 일수(월·연 경계 포함)', () => {
    expect(daysBetween('2026-10-03', '2026-10-06')).toBe(3);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-10-06', '2026-10-06')).toBe(0);
    expect(daysBetween('2026-10-06', '2026-10-03')).toBe(-3);
  });

  it('ageText: 기록 날짜의 해 - 생년, 없거나 음수면 빈 문자열', () => {
    expect(ageText(2012, '2026-10-06')).toBe('14살');
    expect(ageText(null, '2026-10-06')).toBe('');
    expect(ageText(2030, '2026-10-06')).toBe('');
  });
});
