// [공유 로직 사본] 원본: web/src/lib/todoForm.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 할 일 폼 상태와 1차 검증, 본문 변환, 변경 여부 (기획서 W2). 날짜·시각 계산은 하지 않는다(서버가 최종 판단).
// 글자 수는 코드 포인트 기준(서버와 같다). 순수 TS(모바일 사본 대상).
import type { Todo, TodoInput } from './todoApi';

export const TODO_TITLE_MAX = 40;
export const TODO_MEMO_MAX = 200;
export const TODO_HOSPITAL_NOTE_MAX = 500;

export interface TodoDraft {
  /** 수정 중이면 할 일 id, 새로 만들면 null */
  id: string | null;
  title: string;
  /** YYYY-MM-DD. 비어 있으면 아직 고르지 않음(기본값 없음) */
  dueDate: string;
  /** HH:mm. 비어 있으면 시각 없음 */
  dueTime: string;
  memo: string;
  hospitalNote: string;
  remind: boolean;
}

/** 새 할 일: 날짜·시각은 비워 두고 알림만 켜 둔다(기획서 R1·Q9) */
export const EMPTY_TODO_DRAFT: TodoDraft = {
  id: null,
  title: '',
  dueDate: '',
  dueTime: '',
  memo: '',
  hospitalNote: '',
  remind: true,
};

export type TodoField = 'title' | 'dueDate' | 'dueTime' | 'memo' | 'hospitalNote';

export interface TodoProblem {
  field: TodoField;
  message: string;
}

export const TODO_FORM_MESSAGES = {
  titleEmpty: '제목을 적어 주세요.',
  titleLong: `제목은 ${TODO_TITLE_MAX}자까지 적을 수 있어요.`,
  dateEmpty: '날짜를 골라 주세요.',
  dateInvalid: '날짜를 다시 골라 주세요.',
  timeInvalid: '시각을 다시 골라 주세요.',
  memoLong: `일정 메모는 ${TODO_MEMO_MAX}자까지 적을 수 있어요.`,
  hospitalNoteLong: `병원 메모는 ${TODO_HOSPITAL_NOTE_MAX}자까지 적을 수 있어요.`,
} as const;

/** 코드 포인트 수 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function draftFromTodo(todo: Todo): TodoDraft {
  return {
    id: todo.id,
    title: todo.title,
    dueDate: todo.dueDate,
    dueTime: todo.dueTime ?? '',
    memo: todo.memo ?? '',
    hospitalNote: todo.hospitalNote ?? '',
    remind: todo.remind,
  };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 달력에 있는 날짜인지(2월 30일 같은 값 거름). 오늘과의 비교는 하지 않는다 */
export function isCalendarDate(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** 첫 번째 문제를 돌려준다. 없으면 null (화면 순서: 제목 → 날짜 → 시각 → 메모 → 병원 메모) */
export function validateTodoDraft(draft: TodoDraft): TodoProblem | null {
  const title = draft.title.trim();
  if (!title) return { field: 'title', message: TODO_FORM_MESSAGES.titleEmpty };
  if (codePointLength(title) > TODO_TITLE_MAX) return { field: 'title', message: TODO_FORM_MESSAGES.titleLong };
  if (!draft.dueDate) return { field: 'dueDate', message: TODO_FORM_MESSAGES.dateEmpty };
  if (!isCalendarDate(draft.dueDate)) return { field: 'dueDate', message: TODO_FORM_MESSAGES.dateInvalid };
  if (draft.dueTime && !TIME_PATTERN.test(draft.dueTime)) {
    return { field: 'dueTime', message: TODO_FORM_MESSAGES.timeInvalid };
  }
  if (codePointLength(draft.memo.trim()) > TODO_MEMO_MAX) return { field: 'memo', message: TODO_FORM_MESSAGES.memoLong };
  if (codePointLength(draft.hospitalNote.trim()) > TODO_HOSPITAL_NOTE_MAX) {
    return { field: 'hospitalNote', message: TODO_FORM_MESSAGES.hospitalNoteLong };
  }
  return null;
}

/** 폼 → 요청 본문. 빈 값은 null (PUT 은 전체 교체라 지우려면 null 을 보낸다) */
export function toTodoInput(draft: TodoDraft): TodoInput {
  const memo = draft.memo.trim();
  const hospitalNote = draft.hospitalNote.trim();
  return {
    title: draft.title.trim(),
    dueDate: draft.dueDate,
    dueTime: draft.dueTime || null,
    memo: memo || null,
    hospitalNote: hospitalNote || null,
    remind: draft.remind,
  };
}

/** 저장한 값(base)에서 바뀐 곳이 있는지(이탈 확인용). 앞뒤 공백만 다른 것은 같은 값으로 본다 */
export function isTodoDraftDirty(draft: TodoDraft, base: TodoDraft): boolean {
  return (
    draft.title.trim() !== base.title.trim() ||
    draft.dueDate !== base.dueDate ||
    draft.dueTime !== base.dueTime ||
    draft.memo.trim() !== base.memo.trim() ||
    draft.hospitalNote.trim() !== base.hospitalNote.trim() ||
    draft.remind !== base.remind
  );
}
