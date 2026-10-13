// [공유 로직 사본] 원본: web/src/lib/routineText.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 루틴 기록(산책·배변 횟수) 화면 문구와 문장 조립. 사실만 말한다: 숫자와 단위("2회")뿐, 평가·목표·권유·연속 표현 없음.
// 근거: .company/plans/루틴-기록-칩.md 7-2, .company/design/루틴-기록-칩.md 10장
// 금지 표현 검사는 findRoutineForbidden() 으로 테스트가 한다. 문구를 더하면 routineTexts() 에도 더한다.
// 웹 원본. 모바일은 그대로 복사한다.
import { findForbidden } from './historyText';
import { ROUTINE_MAX, type RoutineItem, type RoutineState, type RoutineValue } from './routineForm';

export const ROUTINE_TEXT = {
  title: '산책·배변 기록 (선택)',
  open: '열기',
  close: '접기',
  help: '적은 값만 저장돼요. 배변은 대변을 본 횟수예요.',
  walk: '산책 횟수',
  poop: '배변 횟수',
  none: '안 적음',
  minus: '−',
  plus: '+',
  clear: '지우기',
  limitReached: `${ROUTINE_MAX}회까지 적을 수 있어요.`,
  dirtyChip: '저장 전',
  dirtyNote: '바꾼 내용은 화면 아래 저장 버튼을 눌러야 저장돼요.',
  dirtyFailed: '저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.',
  undoRestored: '산책·배변 기록도 저장 전 내용으로 돌아갔어요.',
  undoRemoved: '산책·배변 기록도 함께 지워졌어요.',
  historyLabel: '산책·배변',
} as const;

const ITEM_NAME: Record<RoutineItem, string> = { walk: '산책', poop: '배변' };

/** "2회" / "안 적음" (0 도 "0회") */
export function routineValueText(value: RoutineValue): string {
  return value == null ? ROUTINE_TEXT.none : `${value}회`;
}

/** 접힌 행 요약·지난 기록 하루 상세 한 줄: "산책 2회 · 배변 3회". 둘 다 안 적었으면 null(줄을 그리지 않는다) */
export function routineSummary(walk: RoutineValue, poop: RoutineValue): string | null {
  const parts: string[] = [];
  if (walk != null) parts.push(`산책 ${walk}회`);
  if (poop != null) parts.push(`배변 ${poop}회`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function routineSummaryOf(routine: RoutineState): string | null {
  return routineSummary(routine.walk, routine.poop);
}

/** 버튼 접근성 라벨: "산책 횟수 줄이기" 등. 값에 따라 바뀌지 않는다 */
export function routineButtonLabel(item: RoutineItem, step: 'plus' | 'minus' | 'clear'): string {
  const base = item === 'walk' ? ROUTINE_TEXT.walk : ROUTINE_TEXT.poop;
  return `${base} ${step === 'plus' ? '늘리기' : step === 'minus' ? '줄이기' : '지우기'}`;
}

/** 값 변경 낭독: "산책 3회" / "배변 안 적음" */
export function routineLiveText(item: RoutineItem, value: RoutineValue): string {
  return `${ITEM_NAME[item]} ${routineValueText(value)}`;
}

/** 토글 접근성 이름에 이어 붙는 상태 글자 */
export function routineToggleLabel(summary: string | null, dirty: boolean): string {
  return [ROUTINE_TEXT.title, summary, dirty ? ROUTINE_TEXT.dirtyChip : null].filter(Boolean).join(', ');
}

/** 저장 되돌리기 결과 안내 뒤에 공백 1칸으로 덧붙일 문장 */
export function undoRoutineSentence(note: 'restored' | 'removed' | null): string {
  if (note === 'restored') return ROUTINE_TEXT.undoRestored;
  if (note === 'removed') return ROUTINE_TEXT.undoRemoved;
  return '';
}

/**
 * 루틴 문구 금지 표현: 기존 findForbidden(이상·정상·증가·감소·% 등)에 평가·목표·연속 표현을 더한다.
 * 검사 대상은 앱이 만든 문구 상수·조립 출력뿐이다(사용자 입력 메모 등은 넘기지 않는다).
 */
const ROUTINE_FORBIDDEN: RegExp[] = [
  /목표/,
  /권장/,
  /적정/,
  /충분/,
  /부족/,
  /더 /,
  /해야/,
  /하세요/,
  /연속/,
  /일째/,
  /달성/,
  /좋아/,
  /나빠/,
  /변비/,
  /설사/,
];

export function findRoutineForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of ROUTINE_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** 금지어 검사용: 고정 문구 전부 + 조립 함수 출력(0·1·20 경계, 접근성 라벨) */
export function routineTexts(): string[] {
  const values: RoutineValue[] = [null, 0, 1, 2, ROUTINE_MAX];
  const items: RoutineItem[] = ['walk', 'poop'];
  const out: string[] = Object.values(ROUTINE_TEXT);
  for (const a of values) {
    out.push(routineValueText(a));
    for (const b of values) {
      const s = routineSummary(a, b);
      if (s) out.push(s);
      out.push(routineToggleLabel(s, true), routineToggleLabel(s, false));
    }
    for (const item of items) out.push(routineLiveText(item, a));
  }
  for (const item of items) {
    for (const step of ['plus', 'minus', 'clear'] as const) out.push(routineButtonLabel(item, step));
  }
  out.push(undoRoutineSentence('restored'), undoRoutineSentence('removed'));
  return out;
}
