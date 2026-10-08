// 날짜·시각 선택기 값 ↔ 문자열 변환 (모바일 전용, 플랫폼 코드라 웹 사본이 아니다)
// - 선택기는 Date 를 주고받지만 앱·API 는 'YYYY-MM-DD' / 'HH:mm' 글자만 다룬다.
// - 모두 기기 "로컬" getter/setter 로 만든다. toISOString() 은 UTC 로 바뀌어 날짜가 하루 밀리는 흔한 버그가 생기므로 쓰지 않는다.
//   이 값들은 "달력 글자"일 뿐이라 기기 시간대가 서울이 아니어도 서버 규칙(서울 기준 기록 날짜)과 충돌하지 않는다.
import { formatRecordDate } from '../lib/format';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' (로컬 날짜) */
export function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 그날 로컬 정오의 Date(서머타임 경계에서 날짜가 밀리지 않게 정오). 형식이 틀리면 지금 */
export function ymdToDate(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Date → 'HH:mm' (로컬 시각, 24시간제) */
export function dateToHHmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'HH:mm' → 오늘 날짜의 그 시각 Date(선택기 초기값용). 형식이 틀리면 지금 */
export function hhmmToDate(hhmm: string, base: Date = new Date()): Date {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  const d = new Date(base);
  if (!m) return d;
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/** 날짜 버튼에 보이는 글자: '2026년 10월 8일 (수)' */
export function formatFullDate(ymd: string): string {
  return `${ymd.slice(0, 4)}년 ${formatRecordDate(ymd)}`;
}

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** 날짜 접근성 문장: '2026년 10월 8일 수요일' */
export function spokenDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 ${weekday}`;
}

/** 시각 접근성 문장: '오전 8시', '오후 8시 30분' */
export function spokenTime(hhmm: string): string {
  const [h, min] = hhmm.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${period} ${hour12}시` : `${period} ${hour12}시 ${min}분`;
}
