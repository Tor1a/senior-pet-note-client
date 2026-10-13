// [공유 로직 사본] 원본: web/src/lib/petProfile.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 반려동물 유형·생일·입양일의 날짜 계산 (순수 함수. Date·시간대에 의존하지 않는다)
// (계약: senior-pet-note-api docs/api-pet-profile.md, 화면 설계: .company/design/초보-견주-온보딩-C.md 5장)
// - 날짜는 달력 날짜다. 새벽 4시 기록 날짜 규칙과 무관하다. "오늘"은 호출하는 쪽이 기기 달력 날짜를 PetToday 로 넘긴다.
// - 웹 원본. 모바일은 그대로 복사한다.

/** 서버가 받는 가장 이른 연도(1980-01-01 이상) */
export const PET_DATE_MIN_YEAR = 1980;

/** 반려동물 유형(보호자가 고른 값). 서버는 이 값으로 판단하지 않고 화면 노출만 정한다 */
export type PetProfileType = 'first_time' | 'senior';

export interface YmdParts {
  year: number;
  month: number;
  day: number;
}

/** 기기의 오늘 달력 날짜 */
export type PetToday = YmdParts;

export function todayParts(date: Date): PetToday {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 그 달의 마지막 날. 연도를 모르면(null) 2월은 29일까지로 본다 */
export function daysInMonth(year: number | null, month: number): number {
  if (month === 2) return year == null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 일 고르기 목록. 월을 모르면 1~31 */
export function dayOptions(year: number | null, month: number | null): number[] {
  const last = month == null ? 31 : daysInMonth(year, month);
  return Array.from({ length: last }, (_, i) => i + 1);
}

export function monthOptions(): number[] {
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

/** 존재하는 달력 날짜인가(연 1980 이전은 따지지 않는다) */
export function isRealDate(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" */
export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/** "YYYY-MM-DD" 를 나눈다. 형식이 틀리거나 없는 날짜면 null */
export function parseIsoDate(value: string | null | undefined): YmdParts | null {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isRealDate(parts.year, parts.month, parts.day) ? parts : null;
}

/** 날짜 비교: 앞이 더 이르면 음수, 같으면 0 */
export function compareYmd(a: YmdParts, b: YmdParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}
