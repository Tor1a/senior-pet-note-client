// QA 추가 테스트: 병원 방문 리포트 집계·문구 경계 (테스트 코드만)
import { describe, expect, it } from 'vitest';
import { daysFixture } from './historyFixtures';
import { reportDays } from './reportStats';
import { buildReport, toPlainText, type ReportInput } from './reportText';

const END = '2026-10-08';
const PET = { name: '초코', species: 'dog' as const, birthYear: 2014, conditions: null };

function make(count: number, logs: Record<string, object> = {}, over: Partial<ReportInput> = {}): ReportInput {
  return {
    pet: PET,
    recordDate: END,
    days: daysFixture(END, count, logs as never),
    medications: { status: 'ready', items: [] },
    includeMemo: true,
    ...over,
  };
}
const dayKey = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;

describe('QA 집계 경계', () => {
  it('체중 소수 둘째 자리와 같은 값 두 개', () => {
    const i = make(14, { '2026-10-01': { weightKg: 4.15 }, '2026-10-05': { weightKg: 4.15 }, '2026-10-08': { weightKg: 4.1 } });
    const m = buildReport(i);
    expect(m.weight.lines.join('\n')).toContain('가장 높은 기록 4.15kg (10월 1일)');
    expect(m.weight.lines.join('\n')).toContain('가장 낮은 기록 4.1kg (10월 8일)');
  });

  it('7/14/30 경계: 각 기간의 첫 날과 한 칸 밖 체중', () => {
    const all = daysFixture(END, 40, { '2026-09-01': { weightKg: 9 }, '2026-09-09': { weightKg: 8 }, '2026-09-25': { weightKg: 7 }, '2026-10-02': { weightKg: 6 } } as never);
    // 30일: 9/9 ~ 10/8, 14일: 9/25 ~, 7일: 10/2 ~
    expect(reportDays(all, 30)[0].recordDate).toBe('2026-09-09');
    expect(reportDays(all, 14)[0].recordDate).toBe('2026-09-25');
    expect(reportDays(all, 7)[0].recordDate).toBe('2026-10-02');
    expect(buildReport({ ...make(1), days: reportDays(all, 30) }).weight.count).toBe(4 - 1);
    expect(buildReport({ ...make(1), days: reportDays(all, 7) }).weight.count).toBe(1);
  });

  it('기록 없는 날이 연속이어도 모두 나열하고 개수가 맞다', () => {
    const m = buildReport(make(14, { '2026-10-08': { memo: 'x' } }));
    expect(m.emptyDays?.title).toBe('기록 없는 날 13일');
    expect(m.emptyDays?.dates.split(', ')).toHaveLength(13);
  });

  it('증상 정확히 12건은 나머지 문구 없음, 13건은 1건', () => {
    const logs12: Record<string, object> = {};
    for (let n = 1; n <= 12; n += 1) logs12[dayKey(n + 8)] = { symptoms: ['vomit'] };
    expect(buildReport(make(30, logs12)).symptoms.rest).toBeNull();
    logs12[dayKey(21)] = { symptoms: ['vomit'] };
    const m = buildReport(make(30, logs12));
    expect(m.symptoms.items).toHaveLength(12);
    expect(m.symptoms.rest).toBe('나머지 1건은 앱에서 볼 수 있어요.');
  });

  it('메모 정확히 12건은 나머지 문구 없음', () => {
    const logs: Record<string, object> = {};
    for (let n = 1; n <= 12; n += 1) logs[dayKey(n + 8)] = { memo: `m${n}` };
    expect(buildReport(make(30, logs)).memos.rest).toBeNull();
  });
});

describe('QA 메모 특수 입력', () => {
  const NASTY = '줄1\n줄2 🐶 <script>alert(1)</script> & "따옴표" 이상해 보여요 병원에 가';
  it('이모지·HTML·금지어·줄바꿈은 가공 없이 모델과 공유 텍스트에 그대로', () => {
    const i = make(14, { '2026-10-08': { memo: NASTY } });
    const m = buildReport(i);
    expect(m.memos.items[0].memo).toBe(NASTY);
    // 줄바꿈 뒤 줄은 들여쓰기 접두("  > ")가 붙는다
    expect(toPlainText(m, i.days)).toContain(NASTY.replace('\n', '\n  > '));
  });
  it('매우 긴 메모(20000자)도 잘리거나 오류 없이 그대로', () => {
    const long = '가'.repeat(20000);
    const i = make(14, { '2026-10-08': { memo: long } });
    const m = buildReport(i);
    expect(m.memos.items[0].memo).toHaveLength(20000);
    expect(toPlainText(m, i.days)).toContain(long);
  });
  it('메모 제외 시 특수 입력이 공유 텍스트 어디에도 없다', () => {
    const i = make(14, { '2026-10-08': { memo: NASTY } }, { includeMemo: false });
    expect(toPlainText(buildReport(i), i.days)).not.toContain('script');
  });
});
