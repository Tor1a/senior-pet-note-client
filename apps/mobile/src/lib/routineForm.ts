// [공유 로직 사본] 원본: web/src/lib/routineForm.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 루틴 기록(산책·배변 횟수, 선택 입력)의 순수 로직. 기획 .company/plans/루틴-기록-칩.md 4·6·7장, 설계 .company/design/루틴-기록-칩.md 3장
// - 값은 null(안 적음) 또는 0~20 정수뿐이다. 기본값·제안값·평균은 없다. 날짜 계산도 하지 않는다(기록 날짜는 서버).
// - 웹 원본. 모바일은 이 파일을 그대로 복사한다(플랫폼 코드 없음).
import type { DailyLog } from './petApi';

/** 한 번에 적을 수 있는 최대 횟수(오입력 방지용 검증 상한이며 권장 값이 아니다) */
export const ROUTINE_MAX = 20;

/** null = 안 적음, 0 = "0회"로 입력한 값 */
export type RoutineValue = number | null;

export interface RoutineState {
  walk: RoutineValue;
  poop: RoutineValue;
}

export type RoutineItem = 'walk' | 'poop';
export type RoutineStep = 'plus' | 'minus' | 'clear';

export const EMPTY_ROUTINE: RoutineState = { walk: null, poop: null };

/** 서버 값을 화면 값으로: 범위 밖·정수 아님·없음(구버전 서버)은 모두 안 적음 */
export function toRoutineValue(raw: unknown): RoutineValue {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= ROUTINE_MAX ? raw : null;
}

export function routineFromLog(log: Pick<DailyLog, 'walkCount' | 'poopCount'> | null): RoutineState {
  if (!log) return { ...EMPTY_ROUTINE };
  return { walk: toRoutineValue(log.walkCount), poop: toRoutineValue(log.poopCount) };
}

/**
 * [−] [+] [지우기] 규칙
 * - plus : 안 적음 → 1회(0 이 아니다), n → n+1, 20 에서는 그대로
 * - minus: n(1~20) → n-1 (1 → 0), 0 과 안 적음은 그대로
 * - clear: 어떤 값이든 안 적음
 */
export function stepRoutine(value: RoutineValue, step: RoutineStep): RoutineValue {
  if (step === 'clear') return null;
  if (step === 'plus') return value == null ? 1 : Math.min(ROUTINE_MAX, value + 1);
  return value == null || value <= 0 ? value : value - 1;
}

/** 버튼이 눌려도 변화가 없는 상태인가(비활성 모양) */
export function isStepDisabled(value: RoutineValue, step: RoutineStep): boolean {
  return stepRoutine(value, step) === value;
}

export function hasRoutineValue(routine: RoutineState): boolean {
  return routine.walk != null || routine.poop != null;
}

export function isSameRoutine(a: RoutineState, b: RoutineState): boolean {
  return a.walk === b.walk && a.poop === b.poop;
}

/** 저장하지 않은 바뀐 내용이 있나(값 비교. 접고 펴기는 상관없다) */
export function isRoutineDirty(form: RoutineState, baseline: RoutineState): boolean {
  return !isSameRoutine(form, baseline);
}

/** 저장 되돌리기 결과 안내에 덧붙일 한 문장의 종류. 루틴 값이 달라지지 않으면 null(기존 문구만) */
export type UndoRoutineNote = 'restored' | 'removed' | null;

/**
 * @param before 저장 직전 서버의 기록(그날 첫 저장이면 null)
 * @param saved  방금 저장한 기록
 * @param restoredByPut 저장 전 값으로 PUT 해서 되돌렸나(false 면 행 삭제)
 */
export function undoRoutineNote(
  before: DailyLog | null,
  saved: DailyLog,
  restoredByPut: boolean,
): UndoRoutineNote {
  const after = routineFromLog(saved);
  if (restoredByPut) return isSameRoutine(routineFromLog(before), after) ? null : 'restored';
  return hasRoutineValue(after) ? 'removed' : null;
}
