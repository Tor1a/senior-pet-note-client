// 투약 알림 설정 화면의 입력 상태 ↔ PUT 본문 변환, 1차 검증, 표시 문장
// (계약: docs/api-reminders.md 2장, 화면 설계: .company/design/투약-알림.md 4장)
// - 반복 규칙 판정·다음 알림 시각은 서버가 계산한다. 여기는 "보여 주는 문장"과 본문 만들기만 한다.
// - repeat 에 맞지 않는 필드는 본문에서 뺀다(서버는 다른 repeat 에 daysOfWeek/intervalDays 가 오면 400).
import { formatMonthDay, formatSeoulDateTime, formatTime } from './format';
import {
  DAYS_OF_WEEK,
  INTERVAL_DAYS_MAX,
  INTERVAL_DAYS_MIN,
  type DayOfWeek,
  type Reminder,
  type ReminderInput,
  type RepeatType,
} from './reminderApi';

export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

export const DAY_NAMES: Record<DayOfWeek, string> = {
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
  sun: '일요일',
};

export const REPEAT_LABELS: Record<RepeatType, string> = {
  daily: '매일',
  weekly: '정한 요일만',
  interval: '며칠마다',
};

/** "며칠마다"를 처음 고를 때의 기본값 */
export const DEFAULT_INTERVAL_DAYS = 2;

/** 화면 입력 상태. 다른 반복 방식의 값도 기억해 둔다(본문에서만 뺀다) */
export interface ReminderForm {
  enabled: boolean;
  repeat: RepeatType;
  daysOfWeek: DayOfWeek[];
  intervalDays: number;
  startDate: string;
  /** false = "정하지 않음(계속 알림)" */
  hasEndDate: boolean;
  endDate: string;
}

/** GET 응답 → 화면 상태 */
export function formFromReminder(r: Reminder): ReminderForm {
  return {
    enabled: r.enabled,
    repeat: r.repeat,
    daysOfWeek: sortDays(r.daysOfWeek ?? []),
    intervalDays: r.intervalDays ?? DEFAULT_INTERVAL_DAYS,
    startDate: r.startDate ?? '',
    hasEndDate: !!r.endDate,
    endDate: r.endDate ?? '',
  };
}

export function sortDays(days: DayOfWeek[]): DayOfWeek[] {
  return DAYS_OF_WEEK.filter((d) => days.includes(d));
}

/** 요일 버튼을 누르면 넣거나 뺀다(월→일 순서 유지) */
export function toggleDay(days: DayOfWeek[], day: DayOfWeek): DayOfWeek[] {
  return days.includes(day) ? days.filter((d) => d !== day) : sortDays([...days, day]);
}

/** 간격 스테퍼: 2~30 밖으로 나가지 않는다 */
export function stepInterval(current: number, delta: number): number {
  return Math.min(INTERVAL_DAYS_MAX, Math.max(INTERVAL_DAYS_MIN, current + delta));
}

/** 화면 상태 → PUT 본문 (전체 교체) */
export function buildReminderBody(f: ReminderForm): ReminderInput {
  const body: ReminderInput = { enabled: f.enabled, repeat: f.repeat };
  if (f.repeat === 'weekly') body.daysOfWeek = sortDays(f.daysOfWeek);
  if (f.repeat === 'interval') body.intervalDays = f.intervalDays;
  if (f.startDate) body.startDate = f.startDate;
  // 종료일을 정하지 않으면 null 을 명시한다(생략해도 지워지지만 의도를 분명히)
  body.endDate = f.hasEndDate && f.endDate ? f.endDate : null;
  return body;
}

export type ReminderField = 'daysOfWeek' | 'intervalDays' | 'startDate' | 'endDate';

export interface ReminderProblem {
  field: ReminderField;
  message: string;
}

/** 화면용 1차 검증. 최종 판정은 서버(400 VALIDATION_ERROR) */
export function validateReminderForm(f: ReminderForm): ReminderProblem | null {
  if (f.repeat === 'weekly' && f.daysOfWeek.length === 0) {
    return { field: 'daysOfWeek', message: '알림 받을 요일을 하나 이상 골라 주세요.' };
  }
  if (
    f.repeat === 'interval' &&
    (!Number.isInteger(f.intervalDays) || f.intervalDays < INTERVAL_DAYS_MIN || f.intervalDays > INTERVAL_DAYS_MAX)
  ) {
    return { field: 'intervalDays', message: `간격은 ${INTERVAL_DAYS_MIN}~${INTERVAL_DAYS_MAX}일 사이로 골라 주세요.` };
  }
  if (!f.startDate) return { field: 'startDate', message: '시작하는 날을 골라 주세요.' };
  if (f.hasEndDate && !f.endDate) {
    return {
      field: 'endDate',
      message: '끝나는 날을 골라 주세요. 끝나는 날이 없으면 "정하지 않음"을 골라 주세요.',
    };
  }
  if (f.hasEndDate && f.endDate < f.startDate) {
    return { field: 'endDate', message: '끝나는 날은 시작하는 날과 같거나 그 뒤여야 해요.' };
  }
  return null;
}

/** 두 상태가 저장 결과로 같은지(저장 안 한 변경 확인용) */
export function sameReminderBody(a: ReminderForm, b: ReminderForm): boolean {
  return JSON.stringify(buildReminderBody(a)) === JSON.stringify(buildReminderBody(b));
}

export function formatDays(days: DayOfWeek[]): string {
  return sortDays(days)
    .map((d) => DAY_LABELS[d])
    .join('·');
}

function joinTimes(times: string[]): string {
  return times.map(formatTime).join(', ');
}

/**
 * 요약 상자 첫 문장 (설계 4-10). 표시 형식만 만든다.
 * today: 시작일이 미래인지 고르는 데만 쓰는 오늘 날짜(YYYY-MM-DD)
 */
export function summaryText(f: ReminderForm, times: string[], today: string): string {
  const at = joinTimes(times);
  let text: string;
  if (f.repeat === 'weekly') {
    text = `매주 ${formatDays(f.daysOfWeek) || '(요일 없음)'} ${at}에 알려 드려요.`;
  } else if (f.repeat === 'interval') {
    text = `${f.startDate ? formatMonthDay(f.startDate) : '시작하는 날'}부터 ${f.intervalDays}일마다 ${at}에 알려 드려요.`;
  } else {
    text = `매일 ${at}에 알려 드려요.`;
  }
  if (f.repeat !== 'interval' && f.startDate && f.startDate > today) {
    text += ` ${formatMonthDay(f.startDate)}부터 시작해요.`;
  }
  if (f.hasEndDate && f.endDate) text += ` ${formatMonthDay(f.endDate)}까지.`;
  return text;
}

/** 간격 보조 문구 */
export function intervalHint(n: number): string {
  return n === 2 ? '하루 걸러 알려 드려요.' : `시작하는 날부터 ${n}일마다 알려 드려요.`;
}

/**
 * 새벽(04:00 전) 회차 안내 (설계 4-6). 요일·간격일 때만.
 * 예시 요일은 고른 첫 요일과 그다음 요일 이름(표시 형식만).
 */
export function dawnNotice(f: ReminderForm, times: string[]): string | null {
  if (f.repeat === 'daily') return null;
  const early = [...times].sort().find((t) => t < '04:00');
  if (!early) return null;
  const first = `새벽 4시 전 시각(${formatTime(early)})은 전날 기록으로 쳐요.`;
  if (f.repeat !== 'weekly' || f.daysOfWeek.length === 0) return first;
  const day = sortDays(f.daysOfWeek)[0];
  const next = DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(day) + 1) % 7];
  return `${first} 예: ${DAY_NAMES[day]}을 고르면 ${DAY_NAMES[next]} ${formatTime(early)}에 "${DAY_NAMES[day]} 약" 알림이 가요.`;
}

/** 저장된 알림의 "다음 알림" 줄 (설계 4-9, 4-10) */
export function nextFireText(r: Reminder): string {
  if (r.updatedAt === null && !r.enabled) return '아직 알림을 켜지 않았어요.';
  if (!r.enabled) return '알림이 꺼져 있어요.';
  if (r.nextFireAt) return `다음 알림: ${formatSeoulDateTime(r.nextFireAt)}`;
  if (r.endDate) return `${formatMonthDay(r.endDate)}에 알림 기간이 끝났어요. 끝나는 날을 바꾸면 다시 알려 드려요.`;
  return '예정된 알림이 없어요.';
}

export type ReminderStatusKind = 'off' | 'on' | 'ended';

/** 약 목록 카드의 알림 상태 줄 (설계 3-2) */
export function reminderStatus(r: Reminder): { kind: ReminderStatusKind; text: string } {
  if (!r.enabled) return { kind: 'off', text: '알림 꺼짐' };
  if (!r.nextFireAt) return { kind: 'ended', text: '알림 기간이 끝났어요' };
  const repeat =
    r.repeat === 'weekly'
      ? formatDays(r.daysOfWeek)
      : r.repeat === 'interval'
        ? r.intervalDays === 2
          ? '2일마다(하루 걸러)'
          : `${r.intervalDays}일마다`
        : '매일';
  const until = r.endDate ? ` · ${formatMonthDay(r.endDate)}까지` : '';
  return { kind: 'on', text: `알림 켜짐 · ${repeat}${until}` };
}
