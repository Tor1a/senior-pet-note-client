// 화면 표시용 형식 함수 (계산 규칙이 아니라 "보여 주는 방법"만 담는다)

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → '10월 6일 (화)'. 서버가 준 날짜를 달력 그대로 보여 준다(시간대 무관) */
export function formatRecordDate(recordDate: string): string {
  const [y, m, d] = recordDate.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

/** 'HH:mm' → '오전 8:00' / '오후 8:00' */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}:${String(m).padStart(2, '0')}`;
}

/** ISO 시각 → 한국 시각 'H:mm' (체크 시각 표시용) */
export function formatTakenAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** 두 'YYYY-MM-DD' 사이 일수 (to - from) */
export function daysBetween(from: string, to: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** 생년으로 대략의 나이(햇수). 기준 해는 서버가 준 recordDate 의 해 */
export function ageText(birthYear: number | null, recordDate: string): string {
  if (!birthYear) return '';
  const age = Number(recordDate.slice(0, 4)) - birthYear;
  return age >= 0 ? `${age}살` : '';
}

/** 받침 유무에 따라 조사를 고른다. 예: withParticle('보리', '와', '과') → '보리와' */
export function withParticle(word: string, noBatchim: string, batchim: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) {
    return word + ((last - 0xac00) % 28 === 0 ? noBatchim : batchim);
  }
  return word + noBatchim;
}

/** 체중 표시: 불필요한 0 제거 (4.40 → 4.4) */
export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

export const LEVEL_LABELS: Record<number, string> = { 1: '조금', 2: '보통', 3: '많이' };
