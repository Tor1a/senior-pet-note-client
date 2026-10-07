// 투약 알림·기기 토큰 API (계약: senior-pet-note-api/docs/api-reminders.md v1)
// - 반복 규칙 판정과 다음 발송 시각(nextFireAt)은 서버가 계산한다. 클라이언트는 표시만 한다.
// - 계약을 바꾸려면 비서실장에게 먼저 알린다. 여기서 임의로 필드를 바꾸지 않는다.
// - petApi.ts(계약 api-today.md)와 계약서가 달라 파일을 나눴다. 순수 TS(모바일 사본 대상).
import type { ApiClient } from './api';

/** daily(매일) / weekly(요일 지정) / interval(N일 간격) */
export type RepeatType = 'daily' | 'weekly' | 'interval';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** 월→일 순서 (서버 응답 정렬 순서와 같다) */
export const DAYS_OF_WEEK: readonly DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** intervalDays 허용 범위 (계약 2장) */
export const INTERVAL_DAYS_MIN = 2;
export const INTERVAL_DAYS_MAX = 30;

/**
 * PUT /api/medications/{id}/reminder 본문 (전체 교체)
 * - daysOfWeek 는 weekly 일 때만, intervalDays 는 interval 일 때만 보낸다(다른 repeat 에 값이 오면 서버가 400).
 * - 보내지 않은 선택 필드는 지워진다(endDate 를 빼면 종료일 없음).
 */
export interface ReminderInput {
  enabled: boolean;
  repeat: RepeatType;
  daysOfWeek?: DayOfWeek[];
  intervalDays?: number;
  /** 생략하면 서버의 현재 기록 날짜 */
  startDate?: string;
  /** 이 날까지 포함. null = 종료일 없음 */
  endDate?: string | null;
}

export interface Reminder {
  medicationId: string;
  enabled: boolean;
  repeat: RepeatType;
  daysOfWeek: DayOfWeek[];
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
  /** 약의 투약 시각 "HH:mm" (읽기 전용) */
  times: string[];
  /** 지금 이후 첫 발송 예정 시각(UTC). 꺼짐·종료·400일 안에 없음이면 null */
  nextFireAt: string | null;
  /** 설정한 적 없으면 null */
  updatedAt: string | null;
}

export type DevicePlatform = 'android' | 'ios' | 'web';

/** PUT /api/devices 본문 */
export interface DeviceInput {
  /** FCM 등록 토큰(getToken 값). 1~4096자, 공백 불가 */
  token: string;
  platform: DevicePlatform;
}

/** 토큰 값은 다시 내려주지 않는다. 해제용 id 를 기기에 저장해 둔다 */
export interface Device {
  id: string;
  platform: DevicePlatform;
  createdAt: string;
  lastSeenAt: string;
}

/** 푸시 data (계약 4장, 값은 모두 문자열) */
export interface MedReminderData {
  type: 'med_reminder';
  medicationId: string;
  petId: string;
  /** 회차의 기록 날짜 YYYY-MM-DD (새벽 회차면 전날) */
  recordDate: string;
  /** 회차 시각 HH:mm */
  scheduledTime: string;
}

/** 알 수 없는 알림은 무시한다(type 이 다르거나 필드가 빠졌으면 null) */
export function parseMedReminderData(data: unknown): MedReminderData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'med_reminder') return null;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const out: MedReminderData = {
    type: 'med_reminder',
    medicationId: str('medicationId'),
    petId: str('petId'),
    recordDate: str('recordDate'),
    scheduledTime: str('scheduledTime'),
  };
  // 필수 필드가 하나라도 없으면 무시한다
  if (!out.medicationId || !out.petId || !out.recordDate || !out.scheduledTime) return null;
  return out;
}

const enc = encodeURIComponent;

export function createReminderApi(client: ApiClient) {
  return {
    getReminder: (medicationId: string) =>
      client.request<Reminder>(`/api/medications/${enc(medicationId)}/reminder`),
    putReminder: (medicationId: string, input: ReminderInput) =>
      client.request<Reminder>(`/api/medications/${enc(medicationId)}/reminder`, { method: 'PUT', body: input }),
    registerDevice: (input: DeviceInput) => client.request<Device>('/api/devices', { method: 'PUT', body: input }),
    /** 로그아웃 직전에 호출한다. 401 이 와도 다시 로그아웃 처리하지 않는다 */
    deleteDevice: (id: string) =>
      client.request<null>(`/api/devices/${enc(id)}`, { method: 'DELETE', ignoreUnauthorized: true }),
  };
}

export type ReminderApi = ReturnType<typeof createReminderApi>;
