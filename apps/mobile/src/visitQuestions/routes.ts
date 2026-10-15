// 진료 때 물어볼 것 화면의 경로 (오늘·할 일 목록·체크리스트 질문 탭에서 진입: 스택 구조, PetGate 안)
// - ?from=todos|checklist 면 뒤로 가기 목적지가 달라진다(없으면 오늘). 파라미터에는 고정 코드만 싣는다.
export const VISIT_QUESTIONS_HREF = '/visit-questions';

export type VisitQuestionsFrom = 'todos' | 'checklist';

export const visitQuestionsHref = (from?: VisitQuestionsFrom) =>
  from ? `${VISIT_QUESTIONS_HREF}?from=${from}` : VISIT_QUESTIONS_HREF;

/** 뒤로 가기 목적지와 문구. 모르는 값은 오늘로 */
export function visitQuestionsBack(from: unknown): { href: string; label: string; a11y: string } {
  if (from === 'todos') return { href: '/todos', label: '할 일 목록으로', a11y: '할 일 목록으로 돌아가기' };
  if (from === 'checklist') {
    return { href: '/checklist', label: '처음 키워요 체크리스트로', a11y: '처음 키워요 체크리스트로 돌아가기' };
  }
  return { href: '/', label: '오늘로', a11y: '오늘 화면으로 돌아가기' };
}
