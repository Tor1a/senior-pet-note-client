// [공유 로직 사본] 원본: web/src/lib/petProfileText.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 반려동물 유형·생일·입양일 화면 문구와 조립. 사실만 말한다: 평가·나이 단정·권유 없음.
// 근거: .company/plans/초보-견주-온보딩-C-E-F.md 2-6, .company/design/초보-견주-온보딩-C.md 9장
// 금지 표현 검사는 findPetProfileForbidden() 으로 테스트가 한다. 문구를 더하면 petProfileTexts() 에도 더한다.
// 웹 원본. 모바일은 그대로 복사한다.
import { findForbidden } from './historyText';
import type { PetProfileType } from './petProfile';

export const PET_PROFILE_TEXT = {
  typeTitle: '함께 지내는 상황 (선택)',
  typeGroupLabel: '함께 지내는 상황',
  typeFirstTime: '처음 키워요',
  typeSenior: '나이 든 아이예요',
  typeLater: '나중에 정할게요',
  typeHelp: '화면에서 보이는 안내만 달라져요. 나이 기준은 없고, 언제든 바꿀 수 있어요.',
  dateToggle: '날짜 자세히 적기 (선택)',
  dateOpen: '열기',
  dateClose: '접기',
  dateHelp: '정확한 날짜를 모르면 비워 두어도 괜찮아요.',
  birthTitle: '생일 (선택)',
  birthHelp: '태어난 해는 위에서 고른 값을 써요.',
  adoptTitle: '입양일 (선택)',
  year: '연도',
  month: '월',
  day: '일',
  none: '선택 안 함',
  errBirthPartial: '생일은 월과 일을 함께 골라 주세요.',
  errBirthNeedsYear: '생일의 월과 일을 적으려면 태어난 해를 먼저 골라 주세요.',
  errAdoptPartial: '입양일은 연도, 월, 일을 모두 골라 주세요. 모르면 비워 두어도 괜찮아요.',
  errFuture: '미래 날짜는 고를 수 없어요.',
  errAdoptBeforeBirth: '입양일이 생일보다 빠를 수 없어요.',
  errNoSuchDate: '없는 날짜예요. 일을 다시 골라 주세요.',
  noticeDayCleared: '고른 날짜가 없는 날이라 일을 비웠어요. 일을 다시 골라 주세요.',
  noticeBirthCleared: '태어난 해를 지워서 생일 월·일도 비웠어요.',
} as const;

export const PET_TYPE_CHOICES: { value: PetProfileType | null; label: string }[] = [
  { value: 'first_time', label: PET_PROFILE_TEXT.typeFirstTime },
  { value: 'senior', label: PET_PROFILE_TEXT.typeSenior },
  { value: null, label: PET_PROFILE_TEXT.typeLater },
];

export const petMonthText = (m: number) => `${m}월`;
export const petDayText = (d: number) => `${d}일`;
export const petYearText = (y: number) => `${y}년`;

/** 접힌 행 아래 요약. 값이 없으면 null. "생일 10월 13일 · 입양 2024년 3월 2일" */
export function petDateSummary(
  birth: { month: number; day: number } | null,
  adopted: { year: number; month: number; day: number } | null,
): string | null {
  const parts: string[] = [];
  if (birth) parts.push(`생일 ${petMonthText(birth.month)} ${petDayText(birth.day)}`);
  if (adopted) parts.push(`입양 ${petYearText(adopted.year)} ${petMonthText(adopted.month)} ${petDayText(adopted.day)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** 금지어 검사용: 이 화면의 고정 문구 전부 + 함수형 문구의 샘플 출력 */
export function petProfileTexts(): string[] {
  return [
    ...Object.values(PET_PROFILE_TEXT),
    petMonthText(10),
    petDayText(13),
    petYearText(2024),
    petDateSummary({ month: 10, day: 13 }, { year: 2024, month: 3, day: 2 }) ?? '',
    petDateSummary({ month: 10, day: 13 }, null) ?? '',
    petDateSummary(null, { year: 2024, month: 3, day: 2 }) ?? '',
  ];
}

// 기획서 2-6 추가어. "나이 든"은 대표님이 정한 선택 라벨이라 허용하고 노령·노화 만 막는다.
const PET_PROFILE_FORBIDDEN: RegExp[] = [
  /노령/,
  /노화/,
  /초보/,
  /권장/,
  /적정/,
  /해야/,
  /하세요/,
  /평균/,
  /또래/,
  /정상/,
];

export function findPetProfileForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of PET_PROFILE_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}
