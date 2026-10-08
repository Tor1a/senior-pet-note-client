// 계약서(api-today.md 3장) 예시 + 체크 안 한 저녁 회차 1개
import type { Medication, Pet, TodayResponse } from '../lib/petApi';
import type { Reminder } from '../lib/reminderApi';

export const PET: Pet = {
  id: 'pet-1',
  name: '보리',
  species: 'dog',
  birthYear: 2012,
  conditions: '신부전',
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

export function todayExample(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return {
    recordDate: '2026-10-06',
    cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
    doses: [
      { medicationId: 'med-a', name: '아조딜', doseText: '1캡슐', scheduledTime: '08:00', taken: true, medLogId: 'log-1', takenAt: '2026-10-05T23:05:00Z' },
      { medicationId: 'med-a', name: '아조딜', doseText: '1캡슐', scheduledTime: '20:00', taken: false, medLogId: null, takenAt: null },
    ],
    dailyLog: null,
    suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
    lastWeight: { weightKg: 4.4, recordDate: '2026-10-03' },
    ...overrides,
  };
}

export const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const MED: Medication = { id: 'med-1', petId: 'pet-1', name: '아조딜', doseText: '1캡슐', times: ['08:00', '20:00'], active: true };

/** 계약서(api-reminders.md) 2장 Reminder 응답 예시 */
export function reminderExample(overrides: Partial<Reminder> = {}): Reminder {
  return {
    medicationId: 'med-1',
    enabled: true,
    repeat: 'weekly',
    daysOfWeek: ['mon', 'wed'],
    intervalDays: null,
    startDate: '2026-10-06',
    endDate: null,
    times: ['08:00', '20:00'],
    nextFireAt: '2026-10-06T23:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z',
    ...overrides,
  };
}

/** 계약서 2장 "설정 전 기본값" */
export const DEFAULT_REMINDER = reminderExample({
  enabled: false,
  repeat: 'daily',
  daysOfWeek: [],
  startDate: '2026-10-07',
  nextFireAt: null,
  updatedAt: null,
});
