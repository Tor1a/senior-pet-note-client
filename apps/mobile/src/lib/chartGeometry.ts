// [공유 로직 사본] 원본: web/src/lib/chartGeometry.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 체중 선 그래프 좌표 계산 (순수 함수. 웹 <svg> 와 모바일 react-native-svg 가 같이 쓴다)
// 값을 만들거나 이어 붙이지 않는다: 측정한 날만 점을 찍고, 날짜 간격이 2일 이상이면 점선으로 표시한다.
import { formatKg } from './format';
import type { WeightPoint } from './historyStats';

export interface ChartBox {
  width: number;
  height: number;
  /** 안쪽 여백 */
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export interface ChartDot {
  x: number;
  y: number;
  recordDate: string;
  weightKg: number;
  index: number;
}

export interface ChartSegment {
  d: string;
  /** 사이에 측정하지 않은 날이 있으면 true (점선) */
  dashed: boolean;
}

export interface ChartTick {
  y: number;
  label: string;
}

export interface ChartXLabel {
  x: number;
  /** days 안에서의 위치 */
  index: number;
}

export interface ChartGeometry {
  dots: ChartDot[];
  segments: ChartSegment[];
  yTicks: ChartTick[];
  xLabels: ChartXLabel[];
  hasDashed: boolean;
}

/** 눈금 두 개 사이 최소 간격(px). 이보다 가까우면 라벨이 겹치므로 최대값 눈금 하나만 둔다 */
const MIN_TICK_GAP = 20;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 세로 범위: 최소~최대에 여유를 둔다. 값이 하나(또는 차이가 매우 작음)면 가운데 ±0.2kg */
export function yDomain(minKg: number, maxKg: number): { lo: number; hi: number } {
  const span = maxKg - minKg;
  if (span < 0.2) {
    const mid = (minKg + maxKg) / 2;
    return { lo: mid - 0.2, hi: mid + 0.2 };
  }
  const pad = span * 0.15;
  return { lo: minKg - pad, hi: maxKg + pad };
}

/** x 라벨을 붙일 위치: 7일 이하는 매일, 그 이상은 마지막 날부터 5일 간격 */
export function xLabelIndexes(dayCount: number): number[] {
  if (dayCount <= 0) return [];
  const step = dayCount <= 7 ? 1 : 5;
  const result: number[] = [];
  for (let i = dayCount - 1; i >= 0; i -= step) result.unshift(i);
  return result;
}

export function buildChart(points: WeightPoint[], dayCount: number, box: ChartBox): ChartGeometry {
  const innerW = box.width - box.padLeft - box.padRight;
  const innerH = box.height - box.padTop - box.padBottom;
  const xOf = (index: number) =>
    dayCount <= 1 ? box.padLeft + innerW / 2 : box.padLeft + (index / (dayCount - 1)) * innerW;

  const xLabels = xLabelIndexes(dayCount).map((index) => ({ x: round1(xOf(index)), index }));
  if (points.length === 0) return { dots: [], segments: [], yTicks: [], xLabels, hasDashed: false };

  const kgs = points.map((p) => p.weightKg);
  const minKg = Math.min(...kgs);
  const maxKg = Math.max(...kgs);
  const { lo, hi } = yDomain(minKg, maxKg);
  const yOf = (kg: number) => box.padTop + (1 - (kg - lo) / (hi - lo)) * innerH;

  const dots = points.map((p) => ({
    x: round1(xOf(p.index)),
    y: round1(yOf(p.weightKg)),
    recordDate: p.recordDate,
    weightKg: p.weightKg,
    index: p.index,
  }));

  const segments: ChartSegment[] = [];
  for (let i = 1; i < dots.length; i += 1) {
    const a = dots[i - 1];
    const b = dots[i];
    segments.push({ d: `M${a.x} ${a.y}L${b.x} ${b.y}`, dashed: b.index - a.index >= 2 });
  }

  // 눈금은 이 기간의 최소·최대 두 개만 (같은 값이면 하나)
  const yTicks: ChartTick[] = [{ y: round1(yOf(maxKg)), label: `${formatKg(maxKg)}kg` }];
  if (minKg !== maxKg && Math.abs(yOf(minKg) - yOf(maxKg)) >= MIN_TICK_GAP) {
    yTicks.push({ y: round1(yOf(minKg)), label: `${formatKg(minKg)}kg` });
  }

  return { dots, segments, yTicks, xLabels, hasDashed: segments.some((s) => s.dashed) };
}
