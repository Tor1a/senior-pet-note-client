// [공유 로직 테스트 사본] 원본: web/src/lib/chartGeometry.test.ts (2026-10-08 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { buildChart, xLabelIndexes, yDomain, type ChartBox } from './chartGeometry';
import type { WeightPoint } from './historyStats';

const BOX: ChartBox = { width: 300, height: 200, padLeft: 40, padRight: 20, padTop: 20, padBottom: 20 };
const pt = (index: number, weightKg: number): WeightPoint => ({
  index,
  recordDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
  weightKg,
});

describe('yDomain', () => {
  it('차이가 작으면 가운데 ±0.2kg, 크면 15% 여유', () => {
    const flat = yDomain(4.4, 4.4);
    expect(flat.lo).toBeCloseTo(4.2);
    expect(flat.hi).toBeCloseTo(4.6);
    const d = yDomain(4, 5);
    expect(d.lo).toBeCloseTo(3.85);
    expect(d.hi).toBeCloseTo(5.15);
  });
});

describe('xLabelIndexes', () => {
  it('7일은 매일, 30일은 마지막 날부터 5일 간격', () => {
    expect(xLabelIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(xLabelIndexes(30)).toEqual([4, 9, 14, 19, 24, 29]);
    expect(xLabelIndexes(0)).toEqual([]);
  });
});

describe('buildChart', () => {
  it('점이 없으면 점·선·눈금이 없다 (x 라벨은 유지)', () => {
    const chart = buildChart([], 7, BOX);
    expect(chart.dots).toEqual([]);
    expect(chart.segments).toEqual([]);
    expect(chart.yTicks).toEqual([]);
    expect(chart.xLabels).toHaveLength(7);
    expect(chart.hasDashed).toBe(false);
  });

  it('점 1개: 선 없음, 눈금 1개, 영역 안에 놓인다', () => {
    const chart = buildChart([pt(3, 4.4)], 7, BOX);
    expect(chart.dots).toHaveLength(1);
    expect(chart.segments).toEqual([]);
    expect(chart.yTicks).toEqual([{ y: chart.dots[0].y, label: '4.4kg' }]);
    expect(chart.dots[0].y).toBeGreaterThanOrEqual(BOX.padTop);
    expect(chart.dots[0].y).toBeLessThanOrEqual(BOX.height - BOX.padBottom);
  });

  it('연속된 날은 실선, 하루 이상 비면 점선. 큰 값이 위(작은 y)', () => {
    const chart = buildChart([pt(0, 4.4), pt(1, 4.2), pt(4, 4.1)], 5, BOX);
    expect(chart.segments.map((s) => s.dashed)).toEqual([false, true]);
    expect(chart.hasDashed).toBe(true);
    expect(chart.dots[0].y).toBeLessThan(chart.dots[1].y);
    expect(chart.dots[0].x).toBe(40);
    expect(chart.dots[2].x).toBe(280);
    expect(chart.segments[0].d).toMatch(/^M40 [\d.]+L[\d.]+ [\d.]+$/);
    expect(chart.yTicks.map((t) => t.label)).toEqual(['4.4kg', '4.1kg']);
  });

  it('하루만 있는 기간은 가운데에 놓는다', () => {
    expect(buildChart([pt(0, 4)], 1, BOX).dots[0].x).toBe(160);
  });
});

describe('눈금 겹침 방지', () => {
  const box: ChartBox = { width: 360, height: 200, padLeft: 56, padRight: 16, padTop: 16, padBottom: 32 };
  it('최소·최대 차이가 0.01kg 이면 눈금 라벨은 하나만', () => {
    const pts = [
      { index: 0, recordDate: '2026-10-07', weightKg: 4.4 },
      { index: 1, recordDate: '2026-10-08', weightKg: 4.41 },
    ];
    expect(buildChart(pts, 7, box).yTicks).toHaveLength(1);
  });
  it('간격이 충분하면 두 개', () => {
    const pts = [
      { index: 0, recordDate: '2026-10-07', weightKg: 4 },
      { index: 1, recordDate: '2026-10-08', weightKg: 5 },
    ];
    const ticks = buildChart(pts, 7, box).yTicks;
    expect(ticks).toHaveLength(2);
    expect(Math.abs(ticks[0].y - ticks[1].y)).toBeGreaterThanOrEqual(20);
  });
});
