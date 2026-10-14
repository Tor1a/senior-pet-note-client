// [공유 로직 사본] 원본: web/src/lib/checklistContent.ts (2026-10-14 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 처음 키워요 체크리스트 항목 목록 (온보딩 F단계). 일반 명사와 질문 문장만: 수치·기간·빈도·권유·의료 판단 없음.
// 근거: .company/plans/초보-견주-온보딩-F.md 2장, .company/design/초보-견주-온보딩-F.md 8장. 웹 원본. 모바일은 그대로 복사한다.
// 검수 전 초안: 수의사 검수·대표님 확정 전까지 최종 문구가 아니다(검수 전 출시 금지). id 는 한 번 쓰면 문구를 고쳐도 바꾸지 않는다.
import type { Species } from './petApi';

export type ChecklistGroup = 'prep' | 'ask';

export interface ChecklistItem {
  id: string;
  group: ChecklistGroup;
  text: string;
  /** 없으면 공통 */
  species?: Species;
}

/** 탭 안 순서 = 이 배열 순서(공통 먼저, 종별은 뒤). 정렬·숨김 없음 */
export const CHECKLIST_ITEMS: readonly ChecklistItem[] = [
  { id: 'prep.food', group: 'prep', text: '사료와 밥그릇' },
  { id: 'prep.water_bowl', group: 'prep', text: '물그릇' },
  { id: 'prep.bed', group: 'prep', text: '잠자리(방석·담요)' },
  { id: 'prep.id_tag', group: 'prep', text: '이름표' },
  { id: 'prep.toilet_supplies', group: 'prep', text: '배변 용품' },
  { id: 'prep.carrier', group: 'prep', text: '이동장' },
  { id: 'prep.grooming', group: 'prep', text: '빗·손톱깎이 등 손질 용품' },
  { id: 'prep.toy', group: 'prep', text: '장난감' },
  { id: 'prep.dog_leash', group: 'prep', text: '목줄·하네스', species: 'dog' },
  { id: 'prep.dog_waste_bag', group: 'prep', text: '산책용 배변봉투', species: 'dog' },
  { id: 'prep.cat_litter', group: 'prep', text: '화장실과 모래', species: 'cat' },
  { id: 'prep.cat_scratcher', group: 'prep', text: '스크래처', species: 'cat' },
  { id: 'ask.food', group: 'ask', text: '지금 먹이는 사료와 간식은 어떻게 하면 되나요?' },
  { id: 'ask.vaccine', group: 'ask', text: '예방접종과 구충은 언제 어떤 순서로 하나요?' },
  { id: 'ask.neuter', group: 'ask', text: '중성화는 언제 상담받으면 되나요?' },
  { id: 'ask.hygiene', group: 'ask', text: '양치와 발톱 손질은 어떻게 하나요?' },
  { id: 'ask.registration', group: 'ask', text: '동물 등록과 이름표는 어떻게 하나요?' },
  { id: 'ask.different', group: 'ask', text: '평소와 다른 모습이 보일 때는 어떻게 하면 되나요?' },
  { id: 'ask.next_visit', group: 'ask', text: '다음 방문은 언제 하면 되나요?' },
  { id: 'ask.dog_walk', group: 'ask', text: '산책은 어떻게 시작하면 되나요?', species: 'dog' },
  { id: 'ask.cat_toilet', group: 'ask', text: '화장실 모래와 놓는 자리는 어떻게 하나요?', species: 'cat' },
];

/** 한 탭에 보일 항목: 공통 + 해당 종. 종을 모르면 공통만 */
export function checklistItemsFor(group: ChecklistGroup, species: Species | null | undefined): ChecklistItem[] {
  return CHECKLIST_ITEMS.filter(
    (item) => item.group === group && (item.species === undefined || item.species === species),
  );
}
