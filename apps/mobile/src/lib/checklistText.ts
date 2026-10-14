// [공유 로직 사본] 원본: web/src/lib/checklistText.ts (2026-10-14 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 처음 키워요 체크리스트 화면 문구와 금지어 검사 (온보딩 F단계). 진행률·완료·권유·의료 표현 없음.
// 근거: .company/plans/초보-견주-온보딩-F.md 2-5·2-6, .company/design/초보-견주-온보딩-F.md 8장. 웹 원본. 모바일은 그대로 복사한다.
// 검수 전 초안: 수의사 검수·대표님 확정 전까지 최종 문구가 아니다.
import { CHECKLIST_ITEMS } from './checklistContent';
import { findForbidden } from './historyText';

export const CHECKLIST_TEXT = {
  title: '처음 키워요 체크리스트',
  notice: '일반적인 목록이에요. 우리 아이에게 맞는 내용은 수의사와 상의해 정해요.',
  saveNote: '체크는 이 기기에만 저장돼요.',
  tabPrep: '준비물',
  tabAsk: '병원에 물어볼 질문',
  tabsLabel: '목록 종류',
  checked: '체크함',
  unchecked: '체크 안 함',
  entryButton: '열기',
  entryButtonLabel: '처음 키워요 체크리스트 열기',
} as const;

// 기획서 2-6: 추가분 + 제안 추가분(빈도·기준·보증·평가 어휘, 한글 수량)
const CHECKLIST_FORBIDDEN: RegExp[] = [
  /필수/, /반드시/, /꼭/, /권장/, /해야/, /하세요/, /금지/, /먹이면/, /응급/, /위급/, /독/, /용량/, /적정/, /충분/, /부족/,
  /\d+\s*(주|개월|살|kg|g|ml|mg|회|번|일|시간)/,
  /매일/, /매주/, /매달/, /하루/, /주기/, /간격/, /횟수/, /분량/, /평균/, /또래/, /초보/, /추천/, /최고/, /안전/,
  /[한두세네]\s*(번|차례|마리|개)/,
];

/** 금지 표현이 들어 있으면 그 표현을, 없으면 null (기존 findForbidden + 위 추가분) */
export function findChecklistForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of CHECKLIST_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** 금지어 검사용: 화면에 나오는 모든 문구(고정 문구 + 항목 전체) */
export function checklistTexts(): string[] {
  return [...Object.values(CHECKLIST_TEXT), ...CHECKLIST_ITEMS.map((item) => item.text)];
}
