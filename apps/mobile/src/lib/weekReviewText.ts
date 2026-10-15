// [공유 로직 사본] 원본: web/src/lib/weekReviewText.ts (2026-10-15 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 오늘 화면 "최근 7일 돌아보기" 카드 문구와 조립 (숫자·날짜·횟수만. 평가·권유·압박·증감 서술 없음)
// 근거: .company/plans/이번-주-돌아보기-카드.md 6장, .company/design/최근-7일-돌아보기-카드.md 9장. 웹 원본, 모바일은 그대로 복사한다.
// 날짜 계산은 하지 않는다(서버가 준 recordDate 문자열을 formatMonthDay 로 바꿔 쓸 뿐). 금지어 검사는 findWeekReviewForbidden().
import { formatKg, formatMonthDay } from './format';
import { findForbidden } from './historyText';

export const WEEK_REVIEW_TEXT = {
  title: '최근 7일 돌아보기',
  open: '펼치기',
  close: '접기',
  none: '최근 7일에는 적은 기록이 없어요.',
  medicationNote: '현재 등록된 약 기준이에요. 체크하지 않은 날도 약을 먹였을 수 있어요.',
} as const;

/** 기간 "10월 2일 ~ 10월 8일" */
export function weekRangeText(firstDate: string, lastDate: string): string {
  return `${formatMonthDay(firstDate)} ~ ${formatMonthDay(lastDate)}`;
}
export function weekRangeSr(firstDate: string, lastDate: string): string {
  return `${formatMonthDay(firstDate)}부터 ${formatMonthDay(lastDate)}까지`;
}

/** "기록한 날 4일 / 7일" (분모는 받은 날 수) */
export function weekRecordedText(recorded: number, total: number): string {
  return `기록한 날 ${recorded}일 / ${total}일`;
}
export function weekRecordedSr(recorded: number, total: number): string {
  return `기록한 날 ${total}일 중 ${recorded}일`;
}

export function weekWeightTitle(count: number): string {
  return `체중 기록 ${count}번`;
}
/** "4.4kg (10월 2일)" */
export function weekWeightValue(kg: number, date: string): string {
  return `${formatKg(kg)}kg (${formatMonthDay(date)})`;
}
export function weekWeightFirst(kg: number, date: string): string {
  return `첫 기록 ${weekWeightValue(kg, date)}`;
}
export function weekWeightLast(kg: number, date: string): string {
  return `마지막 ${weekWeightValue(kg, date)}`;
}

/** "투약 체크 12/14회" */
export function weekMedicationText(taken: number, scheduled: number): string {
  return `투약 체크 ${taken}/${scheduled}회`;
}
export function weekMedicationSr(taken: number, scheduled: number): string {
  return `투약 체크 ${scheduled}회 중 ${taken}회`;
}

/** 카드 문구에 쓰면 안 되는 추가 표현 (기본 금지어 findForbidden 에 더한다) */
const EXTRA_FORBIDDEN: RegExp[] = [
  /연속/, /달성/, /목표/, /보상/, /배지/, /레벨/, /축하/, /칭찬/, /꾸준/, /성공/, /최고/, /대비/,
  /보다 더/, /놓/, /빠짐/, /빠뜨/, /거르/, /끊/, /아직/, /벌써/, /계속/, /오늘도/, /해야/, /하세요/,
  /권장/, /권유/, /적정/, /충분/, /부족/, /평균/, /지난주/, /이번 주/, /일째/,
];

/** 금지 표현이 들어 있으면 그 표현을, 없으면 null */
export function findWeekReviewForbidden(text: string): string | null {
  const base = findForbidden(text);
  if (base) return base;
  for (const pattern of EXTRA_FORBIDDEN) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/** 금지어 전수 검사용: 상수 전부 + 대표 조립 출력(체중 값·날짜·큰 숫자 포함) */
export function weekReviewTexts(): string[] {
  return [
    ...Object.values(WEEK_REVIEW_TEXT),
    weekRangeText('2026-10-02', '2026-10-08'),
    weekRangeSr('2026-10-02', '2026-10-08'),
    weekRangeText('2026-12-31', '2027-01-06'),
    weekRecordedText(4, 7),
    weekRecordedSr(4, 7),
    weekRecordedText(0, 7),
    weekRecordedText(30, 30),
    weekWeightTitle(1),
    weekWeightTitle(3),
    weekWeightValue(4.1, '2026-10-08'),
    weekWeightFirst(4.4, '2026-10-02'),
    weekWeightLast(4.1, '2026-10-08'),
    weekMedicationText(12, 14),
    weekMedicationSr(12, 14),
    weekMedicationText(0, 140),
  ];
}
