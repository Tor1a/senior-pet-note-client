// [공유 로직 사본] 원본: web/src/lib/todoText.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 내 할 일 일정 문구와 문장 조립 (기획서 6-2, 설계서 5장을 기획서 필드에 맞게 조정)
// 원칙: 서비스는 일정·주기를 정해 주거나 추천하지 않는다. 보호자가 입력한 값을 사실대로 보여 줄 뿐이다.
// 해요체, 짧게, 이모지 없음. 권유("~하세요")·독촉("얼른", "밀렸어요")·의료 단정 표현 금지.
// 사용자가 입력한 제목·메모·병원 메모는 검사 대상이 아니다(문구 상수와 조립 함수의 "서비스가 쓴 글"만 검사).
// 금지 표현 검사는 findTodoForbidden() 으로 테스트가 한다. 문구를 더하면 테스트에도 더한다.
import { formatRecordDate, formatTime } from './format';
import { findForbidden } from './historyText';
import type { Todo, TodoDateStatus } from './todoApi';

/**
 * 알림 시각 (기획서 Q1: 서버 설정값. 보호자가 바꾸지 못한다). 서버 yml `app.todo.*-time` 기본값과 같게 둔다.
 * 서버 값이 바뀌면 여기와 문구 테스트를 같이 고친다.
 */
export const TODO_REMIND_DAY_BEFORE_TIME = '20:00';
export const TODO_REMIND_DUE_DAY_TIME = '09:00';

export const TODO_TEXT = {
  // 화면 제목·진입
  listTitle: '내 할 일 일정',
  entryTitle: '내 할 일 일정',
  entryBody: '병원에서 정한 날을 직접 적어 두고 알림을 받을 수 있어요.',
  entryButton: '할 일 일정 보기',
  backToToday: '← 오늘로',
  backToList: '← 할 일 목록으로',
  formTitleNew: '할 일 추가',
  formTitleEdit: '할 일 보기·고치기',

  // 상시 안내 (목록·폼 맨 위)
  guide: '일정과 주기는 수의사 안내에 따라 직접 입력해요. 이 서비스는 일정을 정해 주거나 추천하지 않아요.',

  // 탭·묶음
  tabGroup: '할 일 구분',
  tabOpen: '예정',
  tabDone: '완료',
  groupPast: '지난 일정',
  groupToday: '오늘',
  groupTomorrow: '내일',
  groupFuture: '그 이후',

  // 줄
  noTime: '시각 없음',
  remindOn: '알림 켜짐',
  remindOff: '알림 꺼짐',
  complete: '완료했어요',
  completing: '잠시만요…',
  undo: '되돌리기',
  undoing: '되돌리는 중…',
  cancelDone: '완료 취소',
  open: '보기·고치기',
  doneBadge: '완료',
  hospitalNoteLabel: '병원 메모',
  completedNotice: '완료로 체크했어요.',
  undoneNotice: '완료 체크를 되돌렸어요.',
  cancelDoneNotice: '완료를 취소했어요. 예정 탭에서 볼 수 있어요.',

  // 목록 상태
  loading: '불러오는 중…',
  add: '+ 할 일 추가',
  retry: '다시 불러오기',
  emptyOpenTitle: '아직 적은 할 일이 없어요.',
  emptyOpenBody: '병원에서 정한 날을 적어 두면 하루 전과 당일에 알림으로 알려 드려요.',
  emptyDone: '완료한 할 일이 아직 없어요.',
  loadFailed: '할 일 목록을 불러오지 못했어요.',
  stale: '최신 상태가 아닐 수 있어요. 연결되면 다시 불러올 수 있어요.',
  openedFromPush: '알림으로 열었어요.',
  gone: '이미 지워진 할 일이에요. 목록을 새로 불러왔어요.',
  doneListNote: '완료한 할 일은 최근 100개까지 보여요.',

  // 폼
  fieldTitle: '제목',
  fieldDate: '날짜',
  fieldTime: '시각 (선택)',
  fieldTimeClear: '시각 지우기',
  fieldMemo: '일정 메모 (선택)',
  fieldMemoHelp: '미리 적어 두고 싶은 내용을 남겨 둘 수 있어요. 알림에는 나오지 않아요.',
  fieldHospitalNote: '병원 메모 (선택)',
  fieldHospitalNoteHelp: '병원에서 들은 이야기를 방문한 뒤에 적어 둘 수 있어요. 서비스는 내용을 해석하거나 요약하지 않아요.',
  fieldRemind: '알림 받기',
  remindSkipNote: '이미 지난 날짜나 시각에는 알림이 가지 않아요.',
  remindOffInfo: '알림 없이 목록에만 적어 둬요.',
  dateEditNote: '날짜를 바꾸면 알림도 새 날짜에 맞춰 바뀌어요.',
  save: '저장',
  saveNew: '할 일 등록',
  saveEdit: '고친 내용 저장',
  saving: '잠시만요…',
  summaryProblem: '빠진 곳이 있어요. 표시된 칸을 확인해 주세요.',
  keptInput: '입력한 내용은 그대로 있어요.',
  notFound: '이 할 일을 찾지 못했어요.',

  // 완료·삭제·이탈
  stateSection: '완료와 지우기',
  stateDone: '완료로 체크한 할 일이에요.',
  stateOpen: '아직 완료로 체크하지 않았어요.',
  switchOn: '켜짐',
  switchOff: '꺼짐',
  formComplete: '완료했어요',
  formCancelDone: '완료 취소',
  deleteButton: '이 할 일 지우기',
  deleteTitle: '이 할 일을 지울까요?',
  deleteBody: '지우면 알림도 함께 없어지고, 되돌릴 수 없어요.',
  deleteYes: '지우기',
  deleteNo: '그대로 두기',
  deleting: '지우는 중…',
  leaveTitle: '저장하지 않고 나갈까요?',
  leaveBody: '적은 내용이 저장되지 않아요.',
  leaveStay: '계속 고치기',
  leaveGo: '나가기',

  // 결과 안내
  created: '할 일을 등록했어요.',
  updated: '할 일을 고쳤어요.',
  deleted: '할 일을 지웠어요.',

  // 이 기기 알림 상태 (권한은 버튼에서만 요청)
  deviceRegistered: '이 기기에서 알림을 받아요.',
  deviceChecking: '이 기기의 알림 상태를 확인하고 있어요.',
  deviceDefault: '이 기기에서는 아직 알림을 받을 수 없어요.',
  deviceAllow: '알림 허용하기',
  deviceDenied: '이 기기에서 알림이 꺼져 있어요. 기기 설정에서 알림을 켜면 받을 수 있어요.',
  deviceIosBrowser: 'iPhone에서는 홈 화면에 추가한 앱에서 알림을 받을 수 있어요.',
  deviceIosOutdated: '이 기기에서는 알림을 받을 수 없어요. iOS 16.4 버전부터 받을 수 있어요.',
  deviceUnsupported: '이 브라우저에서는 알림을 받을 수 없어요.',
  deviceUnavailable: '이 환경에서는 알림이 설정되지 않았어요. 할 일은 저장할 수 있어요.',
  deviceError: '이 기기를 알림 받을 기기로 등록하지 못했어요.',
  deviceRetry: '다시 시도',
  deviceDesktop: '컴퓨터에서는 브라우저가 켜져 있을 때만 알림이 와요.',
  devicePermAsked: '이제 이 기기에서도 알림을 받아요.',

  // 오류
  errorLimit: '할 일을 더 등록할 수 없어요. 지난 할 일을 지운 뒤 다시 시도해 주세요.',
  errorComplete: '완료로 체크하지 못했어요.',
  errorUndo: '되돌리지 못했어요.',
  errorRetryHint: '한 번 더 눌러 주세요.',
  errorDelete: '지우지 못했어요.',

  // 포그라운드 배너
  bannerOpen: '할 일 열기',
  bannerBeforeTitle: '내일 일정이 있어요',
  bannerDayTitle: '오늘 일정이 있어요',
  bannerClose: '닫기',
} as const;

/** 알림 켬 안내: "하루 전 오후 8:00, 당일 오전 9:00에 알려 드려요." (시각은 서버 설정값 사본) */
export function remindInfoText(): string {
  return `하루 전 ${formatTime(TODO_REMIND_DAY_BEFORE_TIME)}, 당일 ${formatTime(TODO_REMIND_DUE_DAY_TIME)}에 알려 드려요.`;
}

/** 묶음 제목 (서버가 준 dateStatus 를 글자로) */
export function groupTitle(status: TodoDateStatus): string {
  switch (status) {
    case 'past':
      return TODO_TEXT.groupPast;
    case 'today':
      return TODO_TEXT.groupToday;
    case 'tomorrow':
      return TODO_TEXT.groupTomorrow;
    default:
      return TODO_TEXT.groupFuture;
  }
}

/** "10월 20일 (화) · 오후 3:00" 또는 시각이 없으면 날짜만 */
export function dateTimeLine(todo: Pick<Todo, 'dueDate' | 'dueTime'>): string {
  const date = formatRecordDate(todo.dueDate);
  return todo.dueTime ? `${date} · ${formatTime(todo.dueTime)}` : date;
}

export function remindLine(todo: Pick<Todo, 'remind'>): string {
  return todo.remind ? TODO_TEXT.remindOn : TODO_TEXT.remindOff;
}

/** 줄 전체를 한 번에 읽어 주는 라벨 */
export function rowLabel(todo: Todo): string {
  return `${todo.title}, ${dateTimeLine(todo)}, ${remindLine(todo)}`;
}

export const completeLabel = (title: string) => `${title} 완료로 체크`;
export const undoLabel = (title: string) => `${title} 완료 체크 되돌리기`;
export const cancelDoneLabel = (title: string) => `${title} 완료 취소`;
export const openLabel = (title: string) => `${title} 보기·고치기`;

/** 접힌 줄(완료 직후) 낭독 */
export const collapsedLabel = (title: string) => `${title}, 완료했어요. 되돌리려면 이 줄의 되돌리기를 눌러요.`;

export const countText = (length: number, max: number) => `${length} / ${max}`;

/** 포그라운드 배너 본문: 서버가 보낸 알림 본문(반려동물 · 제목 …)을 그대로 쓴다 */
export function bannerTitle(kind: 'day_before' | 'due_day', serverTitle?: string): string {
  if (serverTitle) return serverTitle;
  return kind === 'day_before' ? TODO_TEXT.bannerBeforeTitle : TODO_TEXT.bannerDayTitle;
}

/**
 * 이 기능의 문구에 쓰면 안 되는 표현을 더한 목록 (기획서 6-2).
 * 기존 findForbidden 목록에 이어 붙여 쓴다. "추천하지 않아요"의 `추천` 자체는 안내문에 필요하므로 `추천해`만 막는다.
 */
export const TODO_FORBIDDEN: RegExp[] = [
  /시간입니다/,
  /시간이에요/,
  /하세요/,
  /드세요/,
  /받으세요/,
  /맞으세요/,
  /해야/,
  /꼭/,
  /놓치/,
  /잊지/,
  /미루/,
  /필요/,
  /권장/,
  /추천해/,
];

/** 금지 표현이 들어 있으면 그 표현을, 없으면 null (historyText.findForbidden + 할 일 추가 목록) */
export function findTodoForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of TODO_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}
