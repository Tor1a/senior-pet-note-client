import {
  dateToHHmm,
  dateToYmd,
  formatFullDate,
  hhmmToDate,
  spokenDate,
  spokenTime,
  ymdToDate,
} from './datePickerValue';

describe('날짜 ↔ YYYY-MM-DD (로컬 getter, UTC 로 밀리지 않음)', () => {
  it('한 자리 월·일을 0 으로 채운다', () => {
    expect(dateToYmd(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
    expect(dateToYmd(new Date(2026, 9, 8, 9, 0))).toBe('2026-10-08');
  });

  it('자정 직전·직후에도 로컬 날짜 그대로(UTC 변환 없음)', () => {
    expect(dateToYmd(new Date(2026, 9, 8, 0, 0, 0))).toBe('2026-10-08');
    expect(dateToYmd(new Date(2026, 9, 8, 23, 59, 59))).toBe('2026-10-08');
    expect(dateToYmd(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(dateToYmd(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
  });

  it('왕복: ymdToDate → dateToYmd 가 같은 글자', () => {
    for (const ymd of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-10-08', '2026-12-31']) {
      expect(dateToYmd(ymdToDate(ymd))).toBe(ymd);
    }
  });

  it('형식이 틀리면 지금 날짜(던지지 않음)', () => {
    expect(dateToYmd(ymdToDate(''))).toBe(dateToYmd(new Date()));
  });
});

describe('시각 ↔ HH:mm', () => {
  it('0 채움, 0시·12시·23시 59분', () => {
    expect(dateToHHmm(new Date(2026, 9, 8, 0, 0))).toBe('00:00');
    expect(dateToHHmm(new Date(2026, 9, 8, 7, 5))).toBe('07:05');
    expect(dateToHHmm(new Date(2026, 9, 8, 12, 0))).toBe('12:00');
    expect(dateToHHmm(new Date(2026, 9, 8, 23, 59))).toBe('23:59');
  });

  it('왕복', () => {
    for (const t of ['00:00', '08:00', '12:00', '20:30', '23:59']) {
      expect(dateToHHmm(hhmmToDate(t))).toBe(t);
    }
  });

  it('hhmmToDate 는 기준 날짜를 유지하고 시각만 바꾼다', () => {
    const base = new Date(2026, 9, 8, 22, 10);
    const d = hhmmToDate('08:00', base);
    expect(dateToYmd(d)).toBe('2026-10-08');
    expect(dateToHHmm(d)).toBe('08:00');
    expect(dateToHHmm(base)).toBe('22:10'); // 원본은 그대로
  });
});

describe('표시·읽기 문장', () => {
  it('날짜 버튼 글자와 접근성 문장', () => {
    expect(formatFullDate('2026-10-08')).toBe('2026년 10월 8일 (목)');
    expect(spokenDate('2026-10-08')).toBe('2026년 10월 8일 목요일');
  });

  it('시각 읽기: 정각이면 분 생략, 0시·12시', () => {
    expect(spokenTime('08:00')).toBe('오전 8시');
    expect(spokenTime('20:30')).toBe('오후 8시 30분');
    expect(spokenTime('00:00')).toBe('오전 12시');
    expect(spokenTime('12:00')).toBe('오후 12시');
  });
});
