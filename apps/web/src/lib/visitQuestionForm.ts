// 진료 때 물어볼 것 입력 정규화·검증, 목록 나누기·한도 판단 (설계 .company/design/진료-질문-메모.md 4·12장)
// - 글자 수는 코드 포인트 기준(서버와 같다). 입력을 자르지 않는다(넘으면 오류 줄만).
// - 줄바꿈은 공백 한 칸으로 바꿔 전송한다. 서버는 줄바꿈을 검사·변환하지 않는다.
// - 날짜 계산은 하지 않는다. 정렬은 서버가 준 시각 문자열의 순서 비교뿐이다.
// - 순수 TS(모바일 사본 대상).
import type { VisitQuestion, VisitQuestionInput } from './visitQuestionApi';

export const VISIT_QUESTION_MAX_LENGTH = 100;
/** 사용자당 한도(완료 포함). 서버가 최종 판단하며 409 로 알려 준다 */
export const VISIT_QUESTION_MAX_COUNT = 30;

export type VisitQuestionTab = 'open' | 'done';
export type VisitQuestionProblem = 'empty' | 'tooLong';

/** 코드 포인트 수 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** 줄바꿈을 공백 한 칸으로 바꾸고 앞뒤 공백을 지운다 */
export function normalizeVisitQuestionText(raw: string): string {
  return raw.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ').trim();
}

/** 입력 칸 아래 "n / 100" 에 쓰는 글자 수(정규화 후) */
export function visitQuestionLength(raw: string): number {
  return codePointLength(normalizeVisitQuestionText(raw));
}

/** 문제가 있으면 종류를, 없으면 null */
export function validateVisitQuestionText(raw: string): VisitQuestionProblem | null {
  const length = visitQuestionLength(raw);
  if (length === 0) return 'empty';
  if (length > VISIT_QUESTION_MAX_LENGTH) return 'tooLong';
  return null;
}

/** 입력 → 요청 본문 (정규화된 글) */
export function toVisitQuestionInput(raw: string): VisitQuestionInput {
  return { text: normalizeVisitQuestionText(raw) };
}

/** 고치는 글이 저장된 글과 같은지(같으면 서버 호출 없이 줄로 돌아간다) */
export function isVisitQuestionUnchanged(raw: string, saved: string): boolean {
  return normalizeVisitQuestionText(raw) === saved;
}

export function isAtVisitQuestionLimit(items: readonly VisitQuestion[] | null): boolean {
  return !!items && items.length >= VISIT_QUESTION_MAX_COUNT;
}

const time = (iso: string | null) => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
};

/**
 * 탭에 보일 줄. `남은 것` = 미완료(등록 순) + 방금 체크해 접힌 줄(원래 자리), `물어본 것` = 완료(최근 완료가 위).
 * 같은 시각이면 서버가 준 순서를 그대로 둔다(안정 정렬).
 */
export function visibleQuestions(
  items: readonly VisitQuestion[],
  tab: VisitQuestionTab,
  collapsedIds: ReadonlySet<string> | readonly string[] = [],
): VisitQuestion[] {
  const collapsed = collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds);
  if (tab === 'open') {
    return items
      .filter((q) => !q.completed || collapsed.has(q.id))
      .map((q, i) => ({ q, i }))
      .sort((a, b) => time(a.q.createdAt) - time(b.q.createdAt) || a.i - b.i)
      .map((x) => x.q);
  }
  return items
    .filter((q) => q.completed)
    .map((q, i) => ({ q, i }))
    .sort((a, b) => time(b.q.completedAt) - time(a.q.completedAt) || a.i - b.i)
    .map((x) => x.q);
}

export function replaceQuestion(items: readonly VisitQuestion[], next: VisitQuestion): VisitQuestion[] {
  return items.map((q) => (q.id === next.id ? next : q));
}

export function removeQuestion(items: readonly VisitQuestion[], id: string): VisitQuestion[] {
  return items.filter((q) => q.id !== id);
}

/** 리포트용: 서버가 준 순서 그대로 글만 (가공·정렬·말줄임 없음). null 이면 빈 목록 */
export function questionTexts(list: { questions?: VisitQuestion[] | null } | null | undefined): string[] {
  return (list?.questions ?? []).filter((q) => !q.completed).map((q) => q.text);
}
