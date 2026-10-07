import { describe, expect, it } from 'vitest';
import { parseMedReminderData, type Reminder } from './reminderApi';
import {
  buildReminderBody,
  formFromReminder,
  nextFireText,
  reminderStatus,
  stepInterval,
  toggleDay,
  validateReminderForm,
} from './reminderForm';

const R: Reminder = {
  medicationId: 'm',
  enabled: true,
  repeat: 'interval',
  daysOfWeek: [],
  intervalDays: 3,
  startDate: '2026-10-06',
  endDate: null,
  times: ['08:00'],
  nextFireAt: '2026-10-06T23:00:00Z',
  updatedAt: '2026-10-06T00:00:00Z',
};
const base = formFromReminder(R);

describe('QA 추가: 경계값', () => {
  it('간격 경계 2·30 통과, 1·31·0·음수·소수·NaN 거부', () => {
    for (const n of [2, 30]) expect(validateReminderForm({ ...base, intervalDays: n })).toBeNull();
    for (const n of [0, 1, 31, -5, 2.5, Number.NaN]) {
      expect(validateReminderForm({ ...base, intervalDays: n })?.field).toBe('intervalDays');
    }
  });

  it('daily/weekly 일 때는 잘못된 intervalDays 를 검증하지 않는다', () => {
    expect(validateReminderForm({ ...base, repeat: 'daily', intervalDays: 99 })).toBeNull();
  });

  it('스테퍼: 경계에서 멈추고 큰 delta 도 클램프', () => {
    expect(stepInterval(2, -1)).toBe(2);
    expect(stepInterval(30, 1)).toBe(30);
    expect(stepInterval(29, 5)).toBe(30);
    expect(stepInterval(3, -10)).toBe(2);
  });

  it('요일 토글: 중복 없이 넣고 빼며 마지막 하나를 빼면 빈 배열', () => {
    expect(toggleDay(['mon'], 'mon')).toEqual([]);
    expect(toggleDay(['sun', 'mon'], 'sun')).toEqual(['mon']);
    expect(toggleDay(['sun'], 'sat')).toEqual(['sat', 'sun']);
  });

  it('weekly 본문은 중복 요일을 만들지 않고 7개 전부도 허용', () => {
    const all = ['sun', 'sat', 'fri', 'thu', 'wed', 'tue', 'mon'] as const;
    const b = buildReminderBody({ ...base, repeat: 'weekly', daysOfWeek: [...all] });
    expect(b.daysOfWeek).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect('intervalDays' in b).toBe(false);
  });

  it('종료일: hasEndDate=false 면 endDate 가 남아 있어도 null, 같은 날(시작=종료)은 통과', () => {
    expect(buildReminderBody({ ...base, hasEndDate: false, endDate: '2026-12-01' }).endDate).toBeNull();
    expect(validateReminderForm({ ...base, hasEndDate: true, endDate: '2026-10-06' })).toBeNull();
  });

  it('enabled=false 여도 본문 형식은 같다(꺼도 규칙 보존)', () => {
    expect(buildReminderBody({ ...base, enabled: false })).toEqual({
      enabled: false,
      repeat: 'interval',
      intervalDays: 3,
      startDate: '2026-10-06',
      endDate: null,
    });
  });

  it('GET 응답 daysOfWeek 가 뒤섞여 와도 정렬해 복원, 종료일 있으면 hasEndDate', () => {
    const f = formFromReminder({ ...R, repeat: 'weekly', daysOfWeek: ['sun', 'mon'], endDate: '2026-11-01' });
    expect(f.daysOfWeek).toEqual(['mon', 'sun']);
    expect(f.hasEndDate).toBe(true);
  });

  it('상태 문구: 꺼짐/종료/간격 3일', () => {
    expect(reminderStatus({ ...R, enabled: false }).kind).toBe('off');
    expect(reminderStatus({ ...R, nextFireAt: null }).kind).toBe('ended');
    expect(reminderStatus(R).text).toContain('3일마다');
    expect(nextFireText({ ...R, enabled: false, updatedAt: null })).toBe('아직 알림을 켜지 않았어요.');
  });
});

describe('QA 추가: 푸시 data 파싱', () => {
  it('값이 문자열이 아니면 빈 문자열로 (null/숫자/배열 입력 안전)', () => {
    expect(parseMedReminderData(null)).toBeNull();
    expect(parseMedReminderData('med_reminder')).toBeNull();
    expect(parseMedReminderData(42)).toBeNull();
    expect(parseMedReminderData({ type: 'med_reminder', medicationId: 1 })).toBeNull();
  });

  it('type 만 있고 필수 필드가 없으면 null 이어야 한다', () => {
    expect(parseMedReminderData({ type: 'med_reminder' })).toBeNull();
  });
});
