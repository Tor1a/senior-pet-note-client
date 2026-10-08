// 약 관리 화면들의 경로와 화면 사이 안내 코드
// - 라우트(설계 2-2): /medications, /medications/new, /medications/[id]/edit, /medications/[id]/reminder
// - 화면 사이 안내는 라우트 파라미터 notice 에 "고정 코드"만 싣는다. 약 이름 같은 자유 텍스트는 싣지 않고
//   (딥링크 오염 방지) 목록 화면이 불러온 약 목록에서 medId 로 이름을 찾아 문구를 만든다.

export const MEDICATIONS_HREF = '/medications';
export const NEW_MEDICATION_HREF = '/medications/new';

export const editMedicationHref = (id: string, from?: 'reminder') =>
  `/medications/${encodeURIComponent(id)}/edit${from ? `?from=${from}` : ''}`;
export const reminderHref = (id: string) => `/medications/${encodeURIComponent(id)}/reminder`;

/** 목록으로 돌아올 때 알려 줄 일. deleted 는 목록 화면 안에서만 쓴다 */
export type ListNoticeKind = 'created' | 'updated' | 'gone';

export function isListNoticeKind(v: unknown): v is ListNoticeKind {
  return v === 'created' || v === 'updated' || v === 'gone';
}

export const GONE_LIST_NOTICE = '목록에서 뺀 약이에요. 약 목록으로 돌아왔어요.';

export const ALREADY_REMOVED_NOTICE = '이미 목록에서 빠진 약이에요. 목록을 다시 불러왔어요.';

export const createdText = (name: string) => `${name}을(를) 등록했어요.`;
export const updatedText = (name: string) => `${name} 정보를 고쳤어요.`;
export const deletedText = (name: string) => `${name}을(를) 목록에서 뺐어요. 지난 기록은 그대로 남아요.`;

interface BackRouter {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: never) => void;
}

/** 뒤로 갈 곳이 있으면 뒤로, 없으면(딥링크로 바로 열렸을 때) 기본 화면으로 */
export function goBackOr(router: BackRouter, fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
