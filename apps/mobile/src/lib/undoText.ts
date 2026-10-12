// [공유 로직 사본] 원본: web/src/lib/undoText.ts (2026-10-12 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 저장 되돌리기·실수 방지 문구 모음 (설계 .company/design/저장-되돌리기.md 11장, 기획 .company/plans/저장-되돌리기.md)
// 해요체, 짧게, 사실만. 변화를 판단·평가·증감·퍼센트로 말하지 않는다.
// 금지 표현 검사는 findUndoForbidden() 으로 테스트가 함께 쓴다(문구를 더하면 테스트에도 더한다).
import { findForbidden } from './historyText';

export const UNDO_TEXT = {
  close: '닫기',

  // A. 투약 체크 되돌리기 / 다시 체크
  doseUndoButton: '되돌리기',
  doseRecheckButton: '다시 체크',
  doseRecheckHint: '다시 체크하면 지금 시각으로 기록돼요.',
  doseAlreadyUndone: '이미 되돌려진 기록이라 화면을 맞췄어요.',

  // B. 일일 기록 저장 되돌리기
  dailyEdited: '고친 내용을 저장했어요.',
  dailyFirstSaved: '첫 기록을 남겼어요. 내일 이 시간쯤 다시 만나요.',
  dailySaved: '오늘 기록을 남겼어요. 수고하셨어요',
  dailyUndoButton: '저장 되돌리기',
  dailyUndoBusy: '되돌리는 중…',
  dailyUndoWhileSaving: '저장하는 중에는 되돌릴 수 없어요.',
  dailyRetry: '다시 시도',
  dailyRestored: '이전에 저장한 내용으로 되돌렸어요.',
  dailyRemoved: '저장하기 전 상태로 되돌렸어요.',
  dailyConflict: '다른 곳에서 고친 기록이라 되돌리지 않았어요.',
  dailyExpired: '시간이 지나 되돌릴 수 없어요.',
  dailyFailNetwork: '되돌리지 못했어요. 서버에 연결할 수 없어요. 방금 저장한 내용은 그대로 남아 있어요.',
  dailyFailServer: '되돌리지 못했어요. 서버에 잠시 문제가 있어요. 방금 저장한 내용은 그대로 남아 있어요.',

  // E. 체중 숫자 확인
  weightTitle: '체중 숫자를 한 번 확인해 주세요',
  weightLastLabel: '지난 기록',
  weightEnteredLabel: '지금 입력',
  weightBody1: '숫자 자리나 소수점이 맞는지 봐 주세요.',
  weightBody2: '맞게 적었다면 그대로 저장할 수 있어요.',
  weightRetype: '다시 입력',
  weightKeep: '그대로 저장',
  weightBarHint: '체중 숫자를 확인하는 중이에요. 위 카드를 확인해 주세요.',

  // C. 저장하지 않은 입력을 두고 나갈 때(웹)
  leaveTitle: '저장하지 않고 나갈까요?',
  leaveBody: '오늘 기록에서 바꾼 내용이 아직 저장되지 않았어요.',
  leaveStay: '계속 적기',
  leaveGo: '저장하지 않고 나가기',
} as const;

/** 약 이름이 들어가는 문구 */
export const doseUndoneText = (name: string) => `${name} 체크를 되돌렸어요.`;
export const doseUndoFailText = (reason: string) => `되돌리지 못했어요. ${reason} 한 번 더 눌러 주세요.`;
export const doseUndoButtonLabel = (what: string, time: string) => `${what} ${time} 체크 되돌리기`;
export const weightLastText = (kg: string, ago: string) => `${kg}kg (${ago})`;
export const weightEnteredText = (kg: string) => `${kg}kg`;
export const weightCardSpeech = (last: string, entered: string) =>
  `${UNDO_TEXT.weightTitle}. 지난 기록 ${last}킬로그램, 지금 입력 ${entered}킬로그램. ${UNDO_TEXT.weightBody1}`;

/**
 * 금지 표현 목록: 기존 findForbidden 목록(의료 판단·평가·증감·퍼센트)에 이 기능에서 특히 조심할 증감·비교 표현을 더한다.
 * 체중 카드는 두 숫자만 나란히 보여 주므로 "차이/변화/배" 같은 말도 쓰지 않는다.
 */
export const UNDO_FORBIDDEN: RegExp[] = [/증감/, /변화/, /차이/, /달라/, /급변/, /배/, /높아/, /낮아/, /커졌/, /작아졌/, /올랐/, /내렸/, /실수/];

export function findUndoForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of UNDO_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}
