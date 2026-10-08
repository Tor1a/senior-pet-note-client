// [공유 로직 테스트 사본] 원본: web/src/lib/historyEdge.test.ts (QA 추가). vitest import 한 줄만 제거(jest 전역 사용).
import { buildChart, xLabelIndexes, type ChartBox } from './chartGeometry';
import { daysFixture } from './historyFixtures';
import { lastNDays, weightFact, weightPoints } from './historyStats';
import { chartDescription, dayRowSummary, findForbidden, weightFactLines } from './historyText';

// QA 추가: 지난 기록 경계값 (체중 개수·같은 값·소수 둘째 자리·빈 날 연속·90일·금지어)
const END = '2026-10-08';
const BOX: ChartBox = { width: 320, height: 160, padLeft: 40, padRight: 10, padTop: 10, padBottom: 20 };

describe('체중 경계', () => {
  it('체중 1개: 비교 문장 없이 "기록 1번"만, 대체 문장은 단일 값', () => {
    const days = daysFixture(END, 30, { '2026-10-05': { weightKg: 4.3 } });
    expect(weightFactLines(days)).toEqual(['이 기간 체중 기록 1번']);
    expect(chartDescription(days)).toBe('지난 30일 체중 기록 1번. 4.3kg(10월 5일)');
    expect(weightFact(days).compare).toBeNull();
  });

  it('체중이 모두 같은 값이면 same, 차이 0, 눈금 1개, 선은 그대로 이어진다', () => {
    const days = daysFixture(END, 7, {
      '2026-10-04': { weightKg: 4.2 },
      '2026-10-05': { weightKg: 4.2 },
      '2026-10-08': { weightKg: 4.2 },
    });
    const fact = weightFact(days);
    expect(fact.compare).toBe('same');
    expect(fact.difference).toBe(0);
    expect(weightFactLines(days)[1]).toContain('과 같아요');
    const chart = buildChart(weightPoints(days), 7, BOX);
    expect(chart.yTicks).toHaveLength(1);
    expect(chart.dots).toHaveLength(3);
    for (const dot of chart.dots) expect(Number.isFinite(dot.y)).toBe(true);
    expect(chart.segments.map((s) => s.dashed)).toEqual([false, true]);
  });

  it('소수 둘째 자리 체중(4.25 등)은 평균·차이를 둘째 자리로 맞추고 부동소수 오차가 없다', () => {
    const days = daysFixture(END, 10, {
      '2026-10-03': { weightKg: 4.15 },
      '2026-10-04': { weightKg: 4.2 },
      '2026-10-08': { weightKg: 4.3 },
    });
    const fact = weightFact(days);
    expect(fact.previousAverage).toBe(4.18); // (4.15+4.20)/2 = 4.175 → HALF_UP 4.18
    expect(fact.difference).toBe(0.12);
    expect(weightFactLines(days)[1]).toBe('마지막 체중 4.3kg (10월 8일) · 직전 7일 평균 4.18kg보다 0.12kg 많아요');
  });

  it('빈 날이 연속 28일이어도 점은 둘, 선은 점선 하나', () => {
    const days = daysFixture(END, 30, { '2026-09-09': { weightKg: 4.5 }, '2026-10-08': { weightKg: 4.4 } });
    const chart = buildChart(weightPoints(days), 30, BOX);
    expect(chart.dots.map((d) => d.index)).toEqual([0, 29]);
    expect(chart.segments).toHaveLength(1);
    expect(chart.segments[0].dashed).toBe(true);
    expect(weightFact(days).previousAverage).toBeNull(); // 직전 7일 안에 값 없음
  });

  it('모든 날이 비면 점·눈금 없음, 문장은 0번', () => {
    const days = daysFixture(END, 30);
    expect(buildChart([], 30, BOX).dots).toEqual([]);
    expect(weightFactLines(days)).toEqual(['이 기간 체중 기록 0번']);
    expect(chartDescription(days)).toBe('지난 30일 체중 기록 0번.');
  });
});

describe('90일 경계 (API 최대 구간)', () => {
  const days90 = daysFixture(
    END,
    90,
    Object.fromEntries(Array.from({ length: 90 }, (_, i) => [daysFixture(END, 90)[i].recordDate, { weightKg: 4 + (i % 7) / 10 }])),
  );

  it('lastNDays 는 90일에서도 7/30 으로 자른다', () => {
    expect(lastNDays(days90, 30)).toHaveLength(30);
    expect(lastNDays(days90, 7)[6].recordDate).toBe(END);
    expect(lastNDays(days90, 90)).toHaveLength(90);
  });

  it('90일 그래프: 점 90개, x 는 안쪽 범위 안, 라벨은 18개 이하', () => {
    const chart = buildChart(weightPoints(days90), 90, BOX);
    expect(chart.dots).toHaveLength(90);
    for (const d of chart.dots) {
      expect(d.x).toBeGreaterThanOrEqual(BOX.padLeft);
      expect(d.x).toBeLessThanOrEqual(BOX.width - BOX.padRight);
      expect(d.y).toBeGreaterThanOrEqual(BOX.padTop - 0.1);
      expect(d.y).toBeLessThanOrEqual(BOX.height - BOX.padBottom + 0.1);
    }
    expect(chart.hasDashed).toBe(false);
    const labels = xLabelIndexes(90);
    expect(labels[labels.length - 1]).toBe(89);
    expect(labels.length).toBeLessThanOrEqual(18);
  });
});

describe('금지어: 다양한 입력에도 모든 문구가 통과한다', () => {
  it('값이 같음/많음/적음/없음 각 경우의 체중 문장과 날짜 줄에 금지 표현이 없다', () => {
    const cases: Record<string, { weightKg: number }>[] = [
      { '2026-10-06': { weightKg: 4.0 }, '2026-10-08': { weightKg: 5.0 } },
      { '2026-10-06': { weightKg: 5.0 }, '2026-10-08': { weightKg: 4.0 } },
      { '2026-10-06': { weightKg: 4.0 }, '2026-10-08': { weightKg: 4.0 } },
      { '2026-10-08': { weightKg: 4.0 } },
      {},
    ];
    for (const logs of cases) {
      const days = daysFixture(END, 7, logs, {}, { scheduledCount: 2, takenCount: 0 });
      const texts = [...weightFactLines(days), chartDescription(days), ...days.map(dayRowSummary)];
      for (const text of texts) expect({ text, hit: findForbidden(text) }).toEqual({ text, hit: null });
    }
  });
});
