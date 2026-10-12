// 반려동물 등록·수정 화면의 경로와 화면 사이 안내 코드 (설계 2장·5장)
// - 라우트: /pet/new(등록, PetGate 밖), /pet/edit(수정, PetGate 안). 수정은 쿼리 from 으로 들어온 화면을 알려 준다.
// - 화면 사이 안내는 파라미터 notice 에 고정 코드만 싣는다(이름 같은 자유 텍스트는 싣지 않는다). 이름은 PetProvider 의 pet 에서 읽는다.
export const NEW_PET_HREF = '/pet/new';
export const EDIT_PET_HREF = '/pet/edit';

export type EditFrom = 'today' | 'medications' | 'account';

export const editPetHref = (from: EditFrom) => `${EDIT_PET_HREF}?from=${from}`;

/** 수정 폼이 [← 돌아가기] 라벨과 저장 후 돌아갈 곳으로 쓴다. 모르는 값이면 오늘 */
export function parseEditFrom(v: unknown): EditFrom {
  return v === 'medications' || v === 'account' ? v : 'today';
}

export const FROM_HREF: Record<EditFrom, string> = {
  today: '/',
  medications: '/medications',
  account: '/account',
};

/** petCreated: 등록 직후(오늘) / petUpdated: 수정 저장 후 / petLimit: 이미 등록돼 있음(오늘) / petGone: 정보가 없어짐(시작 화면) */
export type PetNoticeKind = 'petCreated' | 'petUpdated' | 'petLimit' | 'petGone';

export function isPetNoticeKind(v: unknown): v is PetNoticeKind {
  return v === 'petCreated' || v === 'petUpdated' || v === 'petLimit' || v === 'petGone';
}
