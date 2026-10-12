// [공유 로직 사본] 원본: web/src/lib/undoLogic.ts (2026-10-12 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 저장 되돌리기·실수 방지의 순수 로직 (네트워크·타이머·화면 상태는 화면에 남긴다)
// 기획 .company/plans/저장-되돌리기.md 6장, 계약 senior-pet-note-api/docs/api-undo.md
// - 되돌리기 정보(직전 서버 값, 저장 응답의 updatedAt)는 화면 메모리에만 둔다. 저장소·서버에 남기지 않는다.
import { ApiError } from './api';
import { formatKg } from './format';
import type { DailyLog, DailyLogBody, TodayResponse } from './petApi';

/** [다시 체크]처럼 버튼이 있는 안내를 보여 주는 시간(스크린리더가 켜져 있으면 닫을 때까지 유지) */
export const UNDO_ACTION_MS = 10_000;
/** 버튼 없는 결과 안내를 보여 주는 시간(포커스·마우스 올림 중에는 멈춘다) */
export const UNDO_RESULT_MS = 8_000;
/** 체중 숫자 확인 기준: 지난 기록의 이 배수 이상, 또는 이 배수의 역수 이하(자릿수 오타만 잡는다) */
export const WEIGHT_CHECK_RATIO = 5;
/** 글자 배율이 이 값 이상이면 되돌리기 안내를 스크롤 영역 맨 위로 옮긴다 */
export const UNDO_LARGE_FONT_SCALE = 1.3;

/** 일일 기록 저장 직후 메모리에 두는 되돌리기 정보 */
export interface DailyUndo {
  /** 저장 직전에 GET /today 로 받은 서버의 실제 기록(받지 못했으면 화면이 알던 기록). 그날 첫 저장이면 null */
  before: DailyLog | null;
  /** 방금 저장한 응답(updatedAt 비교용. 서버 수정 후 응답의 updatedAt 은 DB 저장값과 같다) */
  saved: DailyLog;
}

export type DailyUndoPlan =
  | { kind: 'delete'; recordDate: string }
  | { kind: 'put'; recordDate: string; body: DailyLogBody }
  /** 다른 곳에서 그 사이 고쳤다 → 덮어쓰지 않는다 */
  | { kind: 'conflict' }
  /** 기록 날짜가 넘어갔다 → 되돌릴 수 없다 */
  | { kind: 'expired' };

/** 복원할 PUT 본문(8개 필드). id·날짜·updatedAt 은 보내지 않는다 */
export function restoreBody(before: DailyLog): DailyLogBody {
  return {
    foodLevel: before.foodLevel,
    waterLevel: before.waterLevel,
    waterMl: before.waterMl,
    weightKg: before.weightKg,
    symptoms: [...before.symptoms],
    symptomsNone: before.symptomsNone,
    symptomOther: before.symptomOther,
    memo: before.memo,
  };
}

/**
 * 되돌리기 직전에 받은 GET /today 로 무엇을 할지 정한다.
 * 날짜는 저장 때 값이 아니라 지금 서버가 말하는 recordDate 를 쓴다(새벽 4시 경계).
 */
export function planDailyUndo(undo: DailyUndo, current: TodayResponse): DailyUndoPlan {
  if (current.recordDate !== undo.saved.recordDate) return { kind: 'expired' };
  if (!current.dailyLog || current.dailyLog.updatedAt !== undo.saved.updatedAt) return { kind: 'conflict' };
  return undo.before
    ? { kind: 'put', recordDate: current.recordDate, body: restoreBody(undo.before) }
    : { kind: 'delete', recordDate: current.recordDate };
}

export type UndoErrorKind = 'expired' | 'gone' | 'auth' | 'network' | 'server';

/** 되돌리기 요청 오류를 화면이 다룰 갈래로 나눈다 */
export function classifyUndoError(err: unknown): UndoErrorKind {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_RECORD_DATE') return 'expired';
    if (err.kind === 'network') return 'network';
    if (err.status === 404) return 'gone';
    if (err.status === 401) return 'auth';
  }
  return 'server';
}

export interface WeightCheckInput {
  /** 입력칸의 글자 */
  text: string;
  /** [오늘 쟀어요]가 켜져 있나(꺼져 있으면 저장되지 않으므로 묻지 않는다) */
  measured: boolean;
  /** 서버가 준 지난 기록 체중 */
  lastKg: number | null;
  /** 오늘 이미 저장돼 있는 체중 */
  savedKg: number | null;
  /** [그대로 저장]을 눌렀던 값 */
  confirmedKg: number | null;
}

export interface WeightCheck {
  ask: boolean;
  /** 화면에 보여 줄 숫자(kg 글자 제외) */
  entered: string;
  last: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 입력 체중 글자를 저장 때와 같은 방식으로 숫자로. 못 읽으면 null */
export function parseWeight(text: string): number | null {
  const n = Number(text);
  if (text.trim() === '' || Number.isNaN(n) || n <= 0 || n >= 200) return null;
  return round2(n);
}

/**
 * 체중 자릿수 확인이 필요한가: 지난 기록의 5배 이상 또는 1/5 이하일 때만 묻는다(4.3 → 43, 0.43 같은 자릿수 오타).
 * 화면에는 두 숫자만 보여 주고 어떤 판단·비율도 말하지 않는다. 날짜는 계산하지 않는다.
 */
export function checkWeightDigits(input: WeightCheckInput): WeightCheck {
  const none = { ask: false, entered: '', last: '' };
  if (!input.measured || input.lastKg == null || input.lastKg <= 0) return none;
  const entered = parseWeight(input.text);
  if (entered == null) return none;
  if (input.savedKg != null && round2(input.savedKg) === entered) return none; // 이미 저장된 값
  if (input.confirmedKg != null && input.confirmedKg === entered) return none; // 한 번 확인한 값
  const last = input.lastKg;
  const far = entered >= last * WEIGHT_CHECK_RATIO - 1e-9 || entered <= last / WEIGHT_CHECK_RATIO + 1e-9;
  return far ? { ask: true, entered: formatKg(entered), last: formatKg(last) } : none;
}
