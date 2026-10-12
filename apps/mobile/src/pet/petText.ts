// 반려동물 등록·수정 화면 문구 모음 (설계 .company/design/모바일-반려동물-등록.md 9-3, 기획 .company/plans/모바일-반려동물-등록.md)
// 해요체, 짧게, 사실만. 권유·평가·의료적 해석 없음. 모바일 전용 문구라 lib/ 사본이 아니라 여기에 둔다.
// 검증 오류 문구(이름을 적어 주세요 등)는 공유 사본 lib/petForm.ts 의 PET_FORM_ERRORS 를 쓴다.
// 금지 표현 검사는 findPetForbidden() 으로 테스트가 한다(문구를 더하면 테스트에도 더한다).
import { withParticle } from '../lib/format';
import { findForbidden } from '../lib/historyText';
import { PET_FORM_ERRORS } from '../lib/petForm';
import type { Species } from '../lib/petApi';

export const PET_TEXT = {
  // P0 시작 화면 (반려동물 없음)
  startTitle: '시니어펫 노트',
  startCardTitle: '함께 지내는 아이를 소개해 주세요',
  startCardLead: '이름과 종류만 적어도 시작할 수 있어요.',
  startCardBody: '등록하고 나면 하루 기록과 약 체크를 시작할 수 있어요.',
  startButton: '반려동물 등록하기',
  startLimitNote: '한 계정에 한 마리까지 등록할 수 있어요.',
  startWebAsk: '웹에서 이미 등록했나요?',
  startRecheck: '다시 확인하기',

  // 폼 제목·라벨
  newTitle: '반려동물을 소개해 주세요',
  newLead: '이름과 종류만 적어도 시작할 수 있어요.',
  editTitle: '반려동물 정보',
  nameLabel: '이름',
  namePlaceholder: '예: 보리',
  speciesLabel: '종류',
  dog: '개',
  cat: '고양이',
  birthLabel: '태어난 해 (선택)',
  birthNone: '선택 안 함',
  birthHint: '누르면 해를 고를 수 있어요',
  conditionsLabel: '앓고 있는 질환 (선택)',
  conditionsPlaceholder: '예: 신부전, 심장병',
  photoNote: '사진은 지금은 웹에서만 바꿀 수 있어요.',

  // 태어난 해 시트
  sheetTitle: '태어난 해',
  sheetNone: '모르거나 적지 않음',
  sheetDone: '완료',
  sheetCancel: '취소',

  // 글자 수
  conditionsFull: '질환은 200자까지 적을 수 있어요.',

  // 버튼·뒤로
  create: '등록하기',
  save: '고친 내용 저장',
  busy: '잠시만요…',
  backNew: '이전으로',
  backToday: '오늘로',
  backMedications: '약 관리로',
  backAccount: '계정으로',

  // 오류·안내
  summary: '빠진 곳이 있어요. 표시된 칸을 확인해 주세요.',
  kept: '입력한 내용은 그대로 있어요.',
  limit: '이미 등록된 반려동물이 있어요. 등록된 정보로 오늘 화면을 열었어요.',
  gone: '등록된 반려동물 정보를 찾지 못했어요. 다시 등록해 주세요.',
  recheckFailed: '반려동물 정보를 다시 확인하지 못했어요.',
  recheckRetry: '다시 시도',
  close: '닫기',

  // 나가기 확인
  leaveTitle: '저장하지 않고 나갈까요?',
  leaveBody: '적은 내용이 저장되지 않아요.',
  leaveStay: '계속 고치기',
  leaveGo: '나가기',

  // 등록 직후 카드 (오늘 화면)
  createdLine1: '먹이는 약이 있으면 등록해 두세요.',
  createdLine2: '오늘 화면에서 [먹였어요]로 체크할 수 있어요.',
  createdAddMedication: '약 등록하기',
  createdLater: '나중에 할게요',
  createdClose: '닫기',

  // 진입점
  entryButton: '반려동물 정보',
  entryLink: '정보 고치기 ›',
  entryLinkPlain: '정보 고치기',
  accountCardTitle: '반려동물',
} as const;

export const createdTitle = (name: string) => `${withParticle(name, '를', '을')} 등록했어요.`;
export const updatedTitle = (name: string) => `${name} 정보를 고쳤어요.`;
export const remainingText = (n: number) => `남은 글자 ${n}자`;
export const yearText = (year: number) => `${year}년`;
export const entryLinkLabel = (name: string) => `${name} 정보 고치기`;
export const speciesText = (species: Species) => (species === 'dog' ? PET_TEXT.dog : PET_TEXT.cat);
/** 계정 카드 한 줄: 종류 + (해가 있으면) 태어난 해 */
export const petSummary = (species: Species, birthYear: number | null) =>
  birthYear ? `${speciesText(species)} · ${birthYear}년생` : speciesText(species);

/** 금지 표현(의료적 판단·평가·증감·퍼센트)이 들어간 첫 문구. 없으면 null */
export function findPetForbidden(): { text: string; hit: string } | null {
  const texts: string[] = [
    ...Object.values(PET_TEXT),
    ...Object.values(PET_FORM_ERRORS),
    createdTitle('보리'),
    createdTitle('밤'),
    updatedTitle('보리'),
    remainingText(20),
    yearText(2012),
    entryLinkLabel('보리'),
    petSummary('dog', 2012),
    petSummary('cat', null),
  ];
  for (const text of texts) {
    const hit = findForbidden(text);
    if (hit) return { text, hit };
  }
  return null;
}
