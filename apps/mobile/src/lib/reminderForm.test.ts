// [공유 로직 테스트 사본] 원본: web/src/lib/reminderForm.test.ts (2026-10-08 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { addDays, formatMonthDay, formatSeoulDateTime } from './format';
import type { Reminder } from './reminderApi';
import { parseMedReminderData } from './reminderApi';
import {
  buildReminderBody,
  buildSaveBody,
  dawnNotice,
  formFromReminder,
  nextFireText,
  reminderStatus,
  reminderStatusLabel,
  saveMessage,
  stepInterval,
  summaryText,
  toggleDay,
  validateReminderForm,
} from './reminderForm';

// 계약서(docs/api-reminders.md) 2장 Reminder 응답 예시
function reminderExample(overrides: Partial<Reminder> = {}): Reminder {
  return {
    medicationId: 'uuid',
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

// 계약서 2장 "설정 전 기본값"
const DEFAULT_REMINDER = reminderExample({
  enabled: false,
  repeat: 'daily',
  daysOfWeek: [],
  intervalDays: null,
  startDate: '2026-10-07',
  endDate: null,
  nextFireAt: null,
  updatedAt: null,
});

describe('알림 설정 본문 만들기 — repeat 에 맞지 않는 필드는 뺀다', () => {
  it('daily 본문에는 daysOfWeek·intervalDays 가 없다', () => {
    const f = { ...formFromReminder(reminderExample()), repeat: 'daily' as const, intervalDays: 5 };
    const body = buildReminderBody(f);
    expect(body).toEqual({ enabled: true, repeat: 'daily', startDate: '2026-10-06', endDate: null });
    expect('daysOfWeek' in body).toBe(false);
    expect('intervalDays' in body).toBe(false);
  });

  it('weekly 는 요일을 월→일 순으로 정렬해 보낸다', () => {
    const f = { ...formFromReminder(reminderExample()), daysOfWeek: toggleDay(['sun', 'wed'], 'mon') };
    expect(f.daysOfWeek).toEqual(['mon', 'wed', 'sun']);
    expect(buildReminderBody(f)).toEqual({
      enabled: true,
      repeat: 'weekly',
      daysOfWeek: ['mon', 'wed', 'sun'],
      startDate: '2026-10-06',
      endDate: null,
    });
  });

  it('interval 은 intervalDays 만, 종료일을 정하면 endDate 를 보낸다', () => {
    const f = {
      ...formFromReminder(reminderExample()),
      repeat: 'interval' as const,
      intervalDays: 3,
      hasEndDate: true,
      endDate: '2026-10-31',
    };
    expect(buildReminderBody(f)).toEqual({
      enabled: true,
      repeat: 'interval',
      intervalDays: 3,
      startDate: '2026-10-06',
      endDate: '2026-10-31',
    });
  });

  it('GET 응답 → 화면 상태 복원(설정 전 기본값이면 꺼짐·매일·간격 기본 2)', () => {
    expect(formFromReminder(DEFAULT_REMINDER)).toEqual({
      enabled: false,
      repeat: 'daily',
      daysOfWeek: [],
      intervalDays: 2,
      startDate: '2026-10-07',
      hasEndDate: false,
      endDate: '',
    });
  });

  it('간격 스테퍼는 2~30 밖으로 나가지 않는다', () => {
    expect(stepInterval(2, -1)).toBe(2);
    expect(stepInterval(30, 1)).toBe(30);
    expect(stepInterval(3, 1)).toBe(4);
  });
});

describe('알림 설정 1차 검증', () => {
  const base = formFromReminder(reminderExample());

  it('요일 0개, 시작일 없음, 종료일 없음·시작일보다 앞이면 안내', () => {
    expect(validateReminderForm({ ...base, daysOfWeek: [] })).toEqual({
      field: 'daysOfWeek',
      message: '알림 받을 요일을 하나 이상 골라 주세요.',
    });
    expect(validateReminderForm({ ...base, startDate: '' })?.field).toBe('startDate');
    expect(validateReminderForm({ ...base, hasEndDate: true, endDate: '' })?.field).toBe('endDate');
    expect(validateReminderForm({ ...base, hasEndDate: true, endDate: '2026-10-05' })?.message).toBe(
      '끝나는 날은 시작하는 날과 같거나 그 뒤여야 해요.',
    );
    expect(validateReminderForm({ ...base, hasEndDate: true, endDate: '2026-10-06' })).toBeNull();
  });

  it('간격이 2~30 밖이면 안내', () => {
    expect(validateReminderForm({ ...base, repeat: 'interval', intervalDays: 1 })?.field).toBe('intervalDays');
    expect(validateReminderForm({ ...base, repeat: 'interval', intervalDays: 31 })?.field).toBe('intervalDays');
    expect(validateReminderForm({ ...base, repeat: 'interval', intervalDays: 30 })).toBeNull();
  });
});

describe('표시 문장 (계산 없이 서버 값·고른 값만 보여 준다)', () => {
  it('요약 문장', () => {
    const f = formFromReminder(reminderExample());
    expect(summaryText(f, ['08:00', '20:00'], '2026-10-06')).toBe('매주 월·수 오전 8:00, 오후 8:00에 알려 드려요.');
    expect(summaryText({ ...f, repeat: 'daily', startDate: '2026-10-10' }, ['08:00'], '2026-10-06')).toBe(
      '매일 오전 8:00에 알려 드려요. 10월 10일부터 시작해요.',
    );
    expect(
      summaryText({ ...f, repeat: 'interval', intervalDays: 3, hasEndDate: true, endDate: '2026-10-31' }, ['08:00'], '2026-10-06'),
    ).toBe('10월 6일부터 3일마다 오전 8:00에 알려 드려요. 10월 31일까지.');
  });

  it('다음 알림: nextFireAt 을 서울 시각으로, null 이면 상태별 문구', () => {
    expect(nextFireText(reminderExample())).toBe('다음 알림: 10월 7일 (수) 오전 8:00');
    expect(nextFireText(DEFAULT_REMINDER)).toBe('아직 알림을 켜지 않았어요.');
    expect(nextFireText(reminderExample({ enabled: false }))).toBe('알림이 꺼져 있어요.');
    expect(nextFireText(reminderExample({ nextFireAt: null, endDate: '2026-10-31' }))).toBe(
      '10월 31일에 알림 기간이 끝났어요. 끝나는 날을 바꾸면 다시 알려 드려요.',
    );
    expect(nextFireText(reminderExample({ nextFireAt: null }))).toBe('예정된 알림이 없어요.');
  });

  it('약 목록 상태 줄', () => {
    expect(reminderStatus(DEFAULT_REMINDER)).toEqual({ kind: 'off', text: '알림 꺼짐' });
    expect(reminderStatus(reminderExample())).toEqual({ kind: 'on', text: '알림 켜짐 · 월·수' });
    expect(reminderStatus(reminderExample({ repeat: 'daily', daysOfWeek: [], endDate: '2026-10-31' })).text).toBe(
      '알림 켜짐 · 매일 · 10월 31일까지',
    );
    expect(reminderStatus(reminderExample({ repeat: 'interval', daysOfWeek: [], intervalDays: 2 })).text).toBe(
      '알림 켜짐 · 2일마다(하루 걸러)',
    );
    expect(reminderStatus(reminderExample({ nextFireAt: null }))).toEqual({ kind: 'ended', text: '알림 기간이 끝났어요' });
  });

  it('새벽 4시 전 시각 안내는 요일·간격일 때만', () => {
    const f = formFromReminder(reminderExample());
    expect(dawnNotice(f, ['08:00'])).toBeNull();
    expect(dawnNotice({ ...f, repeat: 'daily' }, ['02:00'])).toBeNull();
    expect(dawnNotice(f, ['02:00', '20:00'])).toBe(
      '새벽 4시 전 시각(오전 2:00)은 전날 기록으로 쳐요. 예: 월요일을 고르면 화요일 오전 2:00에 "월요일 약" 알림이 가요.',
    );
    expect(dawnNotice({ ...f, repeat: 'interval' }, ['03:30'])).toBe('새벽 4시 전 시각(오전 3:30)은 전날 기록으로 쳐요.');
  });

  it('날짜 표시 형식', () => {
    expect(formatMonthDay('2026-10-31')).toBe('10월 31일');
    expect(formatSeoulDateTime('2026-10-07T15:30:00Z')).toBe('10월 8일 (목) 오전 12:30');
    expect(formatSeoulDateTime('bad')).toBe('');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('푸시 data 해석 (계약 4장)', () => {
  it('type 이 med_reminder 일 때만 받는다', () => {
    const data = {
      type: 'med_reminder',
      medicationId: 'm1',
      petId: 'p1',
      recordDate: '2026-10-06',
      scheduledTime: '08:00',
    };
    expect(parseMedReminderData(data)).toEqual(data);
    expect(parseMedReminderData({ type: 'other' })).toBeNull();
    expect(parseMedReminderData(undefined)).toBeNull();
  });
});

describe('buildSaveBody', () => {
  it('켠 상태는 buildReminderBody 와 같다', () => {
    const f = formFromReminder(reminderExample({ daysOfWeek: ['mon', 'fri'] }));
    expect(buildSaveBody(f, reminderExample())).toEqual(buildReminderBody(f));
  });

  it('끈 상태에서 숨은 값이 잘못이면(요일 0개) 마지막 저장값을 유지하고 enabled:false', () => {
    const saved = reminderExample({ daysOfWeek: ['mon', 'wed'] });
    const f = { ...formFromReminder(saved), enabled: false, daysOfWeek: [] };
    expect(buildSaveBody(f, saved)).toEqual({
      enabled: false,
      repeat: 'weekly',
      daysOfWeek: ['mon', 'wed'],
      startDate: '2026-10-06',
      endDate: null,
    });
  });

  it('끈 상태라도 값이 올바르면 고른 값을 그대로 보낸다', () => {
    const saved = reminderExample();
    const f = { ...formFromReminder(saved), enabled: false, daysOfWeek: ['sat' as const] };
    expect(buildSaveBody(f, saved)).toEqual({
      enabled: false,
      repeat: 'weekly',
      daysOfWeek: ['sat'],
      startDate: '2026-10-06',
      endDate: null,
    });
  });
});

describe('saveMessage', () => {
  it('끔', () => {
    expect(saveMessage(reminderExample({ enabled: false }), false)).toBe('알림을 껐어요. 고른 설정은 그대로 남아 있어요.');
    expect(saveMessage(reminderExample({ enabled: false }), true)).toBe('알림을 껐어요. 고른 설정은 그대로 남아 있어요.');
  });
  it('이 기기에서 못 받음', () => {
    expect(saveMessage(reminderExample(), true)).toBe('알림을 저장했어요. 다만 이 기기에서는 알림을 받을 수 없어요.');
  });
  it('다음 알림 있음·없음', () => {
    expect(saveMessage(reminderExample(), false)).toBe(
      `알림을 저장했어요. 다음 알림: ${formatSeoulDateTime('2026-10-06T23:00:00Z')}`,
    );
    expect(saveMessage(reminderExample({ nextFireAt: null }), false)).toBe('알림을 저장했어요.');
  });
});

describe('reminderStatusLabel', () => {
  const times = ['08:00', '20:00'];
  it('켜짐: 약 이름·반복·시각·눌러서 이동', () => {
    expect(reminderStatusLabel('아조딜', times, reminderStatus(reminderExample()), false)).toBe(
      '아조딜 알림 켜짐, 월·수. 오전 8:00와 오후 8:00. 누르면 알림 설정으로 가요',
    );
  });
  it('켜짐 + 이 기기에서 못 받음', () => {
    expect(reminderStatusLabel('아조딜', times, reminderStatus(reminderExample()), true)).toBe(
      '아조딜 알림 켜짐, 월·수. 오전 8:00와 오후 8:00. 이 기기에서는 받을 수 없어요. 누르면 알림 설정으로 가요',
    );
  });
  it('꺼짐·기간 끝남은 시각과 기기 문구가 없다', () => {
    expect(reminderStatusLabel('아조딜', times, reminderStatus(reminderExample({ enabled: false })), true)).toBe(
      '아조딜 알림 꺼짐. 누르면 알림 설정으로 가요',
    );
    expect(reminderStatusLabel('아조딜', times, reminderStatus(reminderExample({ nextFireAt: null })), true)).toBe(
      '아조딜 알림 기간이 끝났어요. 누르면 알림 설정으로 가요',
    );
  });
});
