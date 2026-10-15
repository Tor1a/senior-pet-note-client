// [공유 로직 사본] 원본: web/src/lib/visitQuestionText.ts (2026-10-15 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 진료 때 물어볼 것 문구와 접근성 이름 조립 (설계 .company/design/진료-질문-메모.md 7장)
// 원칙: 서비스는 보호자가 적은 글을 저장하고 보여 줄 뿐 답하거나 해석·추천·분류하지 않는다.
// 해요체, 짧게, 이모지 없음(✓ ☐ › 는 글자). 권유("~하세요")·독촉·평가·의료 단정 금지. 화면 문구에 "질문"을 쓰지 않는다
// (체크리스트 탭 `병원에 물어볼 질문`과 이름을 구분). 입력 칸에 예시·placeholder 를 두지 않는다.
// 사용자가 적은 글(서버가 돌려준 text, 입력 초안)은 검사하지 않는다. 접근성 이름은 "앱 문구 + 글"로 조립하되 검사는 앞부분만 한다.
// 금지 표현 검사는 findVisitQuestionForbidden() 으로 테스트가 한다. 문구를 더하면 테스트에도 더한다.
// 순수 TS(모바일 사본 대상).
import { findForbidden } from './historyText';
import { TODO_FORBIDDEN } from './todoText';

export const VISIT_QUESTION_TEXT = {
  // 제목·진입
  title: '진료 때 물어볼 것',
  entryLink: '진료 때 물어볼 것 ›',
  checklistTitle: '내가 물어볼 것 적어 두기',
  checklistLink: '내가 물어볼 것 적어 두기 ›',
  backToToday: '← 오늘로',
  backToTodos: '← 할 일 목록으로',
  backToChecklist: '← 처음 키워요 체크리스트로',

  // 상시 안내·입력
  guide: '병원에서 묻고 싶은 것을 미리 적어 두는 곳이에요. 적은 내용은 그대로 보여 드리고, 서비스는 답하거나 해석하지 않아요.',
  fieldLabel: '물어볼 것',
  fieldHelp: '한 줄로 짧게 적어요. 100자까지 적을 수 있어요.',
  privacyHelp: '반려동물에 관한 내용만 적어 주세요. 보호자 본인의 건강 정보는 적지 마세요.',
  add: '추가',
  addLabel: '물어볼 것 추가',
  adding: '잠시만요…',

  // 탭
  tabGroup: '물어볼 것 구분',
  tabOpen: '남은 것',
  tabDone: '물어본 것',

  // 줄
  done: '물어봤어요',
  doneState: '물어봤어요',
  undo: '되돌리기',
  undoing: '되돌리는 중…',
  edit: '고치기',
  editSave: '저장',
  editCancel: '취소',
  remove: '지우기',
  removing: '지우는 중…',

  // 목록 상태
  emptyOpen: '적어 둔 것이 없어요.',
  emptyDone: '물어봤다고 체크한 것이 없어요.',
  loading: '불러오는 중…',
  retry: '다시 불러오기',
  loadFailed: '물어볼 것을 불러오지 못했어요.',
  stale: '최신 상태가 아닐 수 있어요. 연결되면 다시 불러올 수 있어요.',
  limitReached: '물어볼 것은 30개까지 적어 둘 수 있어요. 지난 것을 지운 뒤 다시 시도해 주세요.',

  // 입력 오류
  errorEmpty: '내용이 비어 있어요.',
  errorTooLong: '100자를 넘었어요. 100자까지 적을 수 있어요.',

  // 동작 오류
  errorAdd: '추가하지 못했어요.',
  errorEdit: '고치지 못했어요.',
  errorDone: '물어봤다고 체크하지 못했어요.',
  errorUndo: '되돌리지 못했어요.',
  errorRemove: '지우지 못했어요.',
  errorRetryHint: '한 번 더 눌러 주세요.',
  gone: '이미 지워진 항목이에요. 목록을 새로 불러왔어요.',

  // 결과 안내
  added: '추가했어요.',
  addedElsewhere: '추가했어요. 남은 것에서 볼 수 있어요.',
  edited: '고쳤어요.',
  removed: '지웠어요.',
  doneNotice: '물어본 것으로 체크했어요.',
  undoneNotice: '남은 것으로 되돌렸어요.',

  // 지우기 확인
  removeTitle: '이 항목을 지울까요?',
  removeBody: '지우면 되돌릴 수 없어요.',
  removeYes: '지우기',
  removeNo: '그대로 두기',

  // 이탈 확인 (할 일 폼과 같은 글자)
  leaveTitle: '저장하지 않고 나갈까요?',
  leaveBody: '적은 내용이 저장되지 않아요.',
  leaveStay: '계속 고치기',
  leaveGo: '나가기',
} as const;

export const VISIT_QUESTION_COUNT_MAX = 100;

/** 접근성 이름: 앞부분은 앱 문구, 뒤는 사용자 글(검사 제외) */
export const doneLabel = (text: string) => `${VISIT_QUESTION_TEXT.done}, ${text}`;
export const undoLabel = (text: string) => `${text} ${VISIT_QUESTION_TEXT.done} ${VISIT_QUESTION_TEXT.undo}`;
export const editLabel = (text: string) => `${VISIT_QUESTION_TEXT.edit}, ${text}`;
export const removeLabel = (text: string) => `${VISIT_QUESTION_TEXT.remove}, ${text}`;
export const saveEditLabel = (text: string) => `${text} 고친 내용 ${VISIT_QUESTION_TEXT.editSave}`;

/** 접근성 이름 조립 함수가 앞에 붙이는 앱 문구(금칙어 검사용) */
export const VISIT_QUESTION_LABEL_PREFIXES: string[] = [
  doneLabel(''),
  undoLabel(''),
  editLabel(''),
  removeLabel(''),
  saveEditLabel(''),
];

/** 문제가 있는 입력의 오류 문구 */
export const problemText = (problem: 'empty' | 'tooLong') =>
  problem === 'empty' ? VISIT_QUESTION_TEXT.errorEmpty : VISIT_QUESTION_TEXT.errorTooLong;

/** 금지 표현이 들어 있으면 그 표현을, 없으면 null (historyText.findForbidden + 할 일 추가 목록) */
export function findVisitQuestionForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of TODO_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}
