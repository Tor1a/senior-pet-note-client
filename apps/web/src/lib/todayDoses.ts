// "오늘" 화면 투약 카드의 순수 로직 (상태 배열 → 새 배열). 네트워크·타이머는 화면에 남긴다.
// 웹 TodayPage 와 모바일 오늘 화면이 같은 규칙을 쓰도록 뽑아냈다(모바일은 사본, mobile/README.md 참고).
import { ageText, formatTakenAt, formatTime } from './format';
import type { Dose, MedLog, Pet, TodayResponse } from './petApi';

/** 체크한 약 카드를 한 줄로 접기까지 기다리는 시간 (와이어프레임 개발자 메모 6) */
export const COLLAPSE_DELAY_MS = 300;
/** 접힌 뒤 아래 영역 입력을 조금 더 막아 잘못 탭하는 일을 줄인다 */
export const SHIFT_GUARD_EXTRA_MS = 150;
/** 알림으로 열었을 때 "방금 알림 온 약" 강조를 유지하는 시간 (설계서 9-4) */
export const HIGHLIGHT_MS = 2 * 60 * 1000;

export interface DoseView extends Dose {
  /** 서버 응답을 기다리는 중 */
  pending: boolean;
  /** 한 줄로 접힘 */
  collapsed: boolean;
}

export const doseKey = (d: Dose) => `${d.medicationId}@${d.scheduledTime}`;

/** 서버 응답의 doses → 화면용(체크한 약은 접힌 상태로 시작) */
export function toDoseViews(doses: Dose[]): DoseView[] {
  return doses.map((d) => ({ ...d, pending: false, collapsed: d.taken }));
}

/**
 * GET /today 응답(투약만)을 화면에 반영한다. 응답을 기다리는 중(pending)인 회차는 낙관적 상태를 그대로 둔다
 * (서버가 아직 모르는 체크·취소를 오래된 응답이 덮어쓰지 않게).
 */
export function mergeServerDoses(list: DoseView[], serverDoses: Dose[]): DoseView[] {
  const pending = new Map(list.filter((d) => d.pending).map((d) => [doseKey(d), d]));
  return toDoseViews(serverDoses).map((d) => pending.get(doseKey(d)) ?? d);
}

function patchDose(list: DoseView[], key: string, patch: Partial<DoseView>): DoseView[] {
  return list.map((d) => (doseKey(d) === key ? { ...d, ...patch } : d));
}

/** 낙관적 체크: 바로 체크 표시(서버 응답 전) */
export function markTaken(list: DoseView[], key: string, nowIso: string): DoseView[] {
  return patchDose(list, key, { taken: true, pending: true, takenAt: nowIso });
}

/** 체크한 회차를 한 줄로 접는다(아직 체크 상태일 때만) */
export function collapseTaken(list: DoseView[], key: string): DoseView[] {
  return list.map((d) => (doseKey(d) === key && d.taken ? { ...d, collapsed: true } : d));
}

/** 체크 저장 성공: 서버가 준 medLogId·takenAt 으로 맞춘다 */
export function applyCheckResult(list: DoseView[], key: string, log: Pick<MedLog, 'id' | 'takenAt'>): DoseView[] {
  return patchDose(list, key, { taken: true, pending: false, medLogId: log.id, takenAt: log.takenAt });
}

/** 체크 실패: 체크 전 상태로 되돌린다 */
export function rollback(list: DoseView[], key: string): DoseView[] {
  return patchDose(list, key, { taken: false, pending: false, takenAt: null, medLogId: null, collapsed: false });
}

/** 낙관적 취소: 체크를 풀고 응답을 기다린다 */
export function markUntaken(list: DoseView[], key: string): DoseView[] {
  return patchDose(list, key, { taken: false, pending: true, collapsed: false, takenAt: null });
}

/** 취소 성공 */
export function applyUncheckResult(list: DoseView[], key: string): DoseView[] {
  return patchDose(list, key, { taken: false, pending: false, medLogId: null, takenAt: null });
}

/** 취소 실패: 취소 전 상태로 복원 */
export function restoreDose(list: DoseView[], key: string, before: DoseView): DoseView[] {
  return patchDose(list, key, { ...before, pending: false });
}

/** 이미 체크된 약(409): 체크는 유지하고 응답 대기만 끝낸다 */
export function settleDose(list: DoseView[], key: string): DoseView[] {
  return patchDose(list, key, { pending: false });
}

/**
 * 알림이 가리킨 회차 (알림-바로-체크 리뷰 필수 1).
 * URL 의 med(약)·t(시각)·d(기록 날짜)에서 만든다. t·d 는 옛 알림(URL 에 없음)이면 null.
 */
export interface PushTarget {
  medicationId: string;
  scheduledTime: string | null;
  recordDate: string | null;
}

/** URL 값 → 알림이 가리킨 회차. med 가 없으면 null */
export function pushTargetFromParams(
  med: string | null | undefined,
  t: string | null | undefined,
  d: string | null | undefined,
): PushTarget | null {
  if (!med) return null;
  return { medicationId: med, scheduledTime: t || null, recordDate: d || null };
}

/**
 * 처음 정한 강조 회차. 한 번 정하면 화면이 이 값을 들고 있는다(렌더마다 다시 고르지 않는다).
 * - exact: 약·시각이 모두 맞는 회차 → 큰 [먹였어요]를 붙여도 된다. 시각이 없는 옛 URL(false)은 강조만 한다(보수적 폴백).
 * - armed: 고른 시점에 아직 안 먹인 회차 → 강조·큰 버튼 대상. 이미 먹인 회차(false)는 맨 위로만 올린다.
 */
export interface PushHold {
  key: string;
  exact: boolean;
  armed: boolean;
}

/**
 * 알림으로 열었을 때 맨 위로 올리고 강조할 회차를 처음 한 번 고른다.
 * - d(알림의 기록 날짜)가 오늘 응답의 recordDate 와 다르면 null(어제 알림은 강조·큰 버튼 없음). 값 비교만 한다.
 * - t 가 있으면 약·시각이 모두 맞는 회차만 고른다(없으면 null). 같은 약의 다음 회차로 넘어가지 않는다.
 * - t 가 없으면(옛 URL) 그 약의 아직 안 먹인 첫 회차를 강조만 한다. 모두 먹였다면 첫 회차를 맨 위로만 올린다.
 */
export function decidePushHold(
  doses: DoseView[],
  target: PushTarget | null,
  recordDate: string | null,
): PushHold | null {
  if (!target) return null;
  if (target.recordDate && target.recordDate !== recordDate) return null;
  if (target.scheduledTime) {
    const d = doses.find((x) => x.medicationId === target.medicationId && x.scheduledTime === target.scheduledTime);
    return d ? { key: doseKey(d), exact: true, armed: !d.taken } : null;
  }
  const mine = doses.filter((x) => x.medicationId === target.medicationId);
  const todo = mine.find((x) => !x.taken);
  if (todo) return { key: doseKey(todo), exact: false, armed: true };
  return mine[0] ? { key: doseKey(mine[0]), exact: false, armed: false } : null;
}

/** 알림으로 열었을 때 강조할 회차 key(처음 고르는 규칙). 이미 먹였거나 시간이 지났거나 회차가 맞지 않으면 null */
export function pickHighlightKey(
  doses: DoseView[],
  target: PushTarget | null,
  expired: boolean,
  recordDate: string | null,
): string | null {
  if (expired) return null;
  const hold = decidePushHold(doses, target, recordDate);
  return hold?.armed ? hold.key : null;
}

/** 알림으로 열었을 때 맨 위로 올릴 회차 key (알림-바로-체크 설계 6-2). 맞는 회차가 없으면 null */
export function pickPinnedKey(doses: DoseView[], target: PushTarget | null, recordDate: string | null): string | null {
  return decidePushHold(doses, target, recordDate)?.key ?? null;
}

/**
 * 고정해 둔 회차에서 화면 값을 만든다.
 * - highlightKey: 테두리·"방금 알림 온 약" (2분 뒤 expired 로 꺼진다)
 * - bigKey: 큰 [먹였어요] 를 붙일 회차. 시간이 지나도 유지한다(버튼이 사라져 카드 높이가 바뀌며 손가락 밑에서 튀지 않게).
 *   시각까지 맞는 회차(exact)에만 붙는다. 그 회차를 체크하면 카드가 접히며 사라지고 다음 회차로 옮겨 가지 않는다.
 */
export function holdKeys(hold: PushHold | null, expired: boolean): { highlightKey: string | null; bigKey: string | null } {
  if (!hold || !hold.armed) return { highlightKey: null, bigKey: null };
  return { highlightKey: expired ? null : hold.key, bigKey: hold.exact ? hold.key : null };
}

/** 화면에 그릴 순서: pinnedKey 회차를 맨 위로, 나머지는 서버 순서(시각순) 그대로 */
export function orderWithPinned(doses: DoseView[], pinnedKey: string | null): DoseView[] {
  if (!pinnedKey) return doses;
  const pinned = doses.find((d) => doseKey(d) === pinnedKey);
  if (!pinned) return doses;
  return [pinned, ...doses.filter((d) => d !== pinned)];
}

/** 카드에 보여 줄 문구 조각 */
export function doseParts(dose: Dose): { what: string; time: string; takenText: string } {
  return {
    what: [dose.name, dose.doseText].filter(Boolean).join(' '),
    time: formatTime(dose.scheduledTime),
    takenText: dose.taken && dose.takenAt ? `${formatTakenAt(dose.takenAt)} 먹임` : '먹임',
  };
}

/** 접근성 문구(스크린리더) */
export function doseLabel(dose: Dose): string {
  const { what, time, takenText } = doseParts(dose);
  return dose.taken
    ? `${time} ${what}, ${takenText}. 누르면 체크를 되돌려요`
    : `${time} ${what}, 아직 체크하지 않았어요. 누르면 먹였어요로 체크해요`;
}

export function daysAgoText(days: number): string {
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

/** 헤더의 "이름 · 나이 · 지병" */
export function headerInfo(pet: Pet | null, today: TodayResponse | null): string {
  return [pet?.name ?? '', pet && today ? ageText(pet.birthYear, today.recordDate) : '', pet?.conditions ?? '']
    .filter(Boolean)
    .join(' · ');
}
