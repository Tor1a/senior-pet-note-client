import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { buildChart, type ChartBox, type ChartDot } from '../lib/chartGeometry';
import { formatKg } from '../lib/format';
import { weightPoints } from '../lib/historyStats';
import { chartDescription, HISTORY_TEXT, selectedWeightText } from '../lib/historyText';
import type { HistoryDay } from '../lib/petApi';

// 체중 선 그래프 (직접 그린 <svg>). 좌표 계산은 lib/chartGeometry.ts 와 공유한다.
// 접근성: svg role="img" + title/desc(사실만), 그래프에 포커스가 오면 ←/→ 로 체중 기록을 옮기고 값을 읽어 준다.
// 터치로 고르는 기능은 없다(점이 작아 잘못 누르기 쉬움). 값은 날짜별 목록과 표 보기로 확인한다.
// readOnly(병원 방문 리포트): 키 이동·안내 문구 없이 그림만 그리고, 첫·마지막 기록 점 옆에 값 글자를 적는다.

const BOX: ChartBox = { width: 360, height: 200, padLeft: 56, padRight: 16, padTop: 16, padBottom: 32 };

interface ValueLabel {
  recordDate: string;
  x: number;
  y: number;
  text: string;
}

/**
 * 첫·마지막 기록 점의 값 글자 자리. 이웃 점이 위에 있으면 점 아래, 아니면 위에 둬서 선과 겹치지 않게 한다.
 * 두 글자가 가까워 겹칠 수 있으면 마지막 값만 쓴다.
 */
function valueLabels(dots: ChartDot[]): ValueLabel[] {
  if (dots.length === 0) return [];
  const place = (dot: ChartDot, neighbor: ChartDot | undefined): ValueLabel => ({
    recordDate: dot.recordDate,
    x: dot.x,
    y: neighbor && neighbor.y < dot.y ? dot.y + 22 : dot.y - 11,
    text: formatKg(dot.weightKg),
  });
  const first = dots[0];
  const last = dots[dots.length - 1];
  if (dots.length === 1) return [place(first, undefined)];
  const a = place(first, dots[1]);
  const b = place(last, dots[dots.length - 2]);
  if (Math.abs(a.x - b.x) < 44 && Math.abs(a.y - b.y) < 18) return [b];
  return [a, b];
}

export default function WeightChart({ days, readOnly = false }: { days: HistoryDay[]; readOnly?: boolean }) {
  const titleId = useId();
  const descId = useId();
  const points = useMemo(() => weightPoints(days), [days]);
  const chart = useMemo(() => buildChart(points, days.length, BOX), [points, days.length]);
  const [selected, setSelected] = useState<number | null>(null);
  // 기간(7일↔30일)이 바뀌면 점 목록이 달라지므로 선택을 지운다(범위 밖 인덱스 방지)
  const [prevDays, setPrevDays] = useState(days);
  if (prevDays !== days) {
    setPrevDays(days);
    setSelected(null);
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = selected === null ? 0 : Math.min(points.length - 1, selected + 1);
    else if (e.key === 'ArrowLeft') next = selected === null ? points.length - 1 : Math.max(0, selected - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = points.length - 1;
    if (next === null) return;
    e.preventDefault();
    setSelected(next);
  };

  const selectedPoint = selected !== null ? points[selected] : null;
  const description = chartDescription(days);

  return (
    <div>
      <div
        className="chart-box"
        {...(readOnly
          ? {}
          : { tabIndex: 0, role: 'group', 'aria-label': `체중 그래프. ${HISTORY_TEXT.keyHint}`, onKeyDown })}
      >
        <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
          <title id={titleId}>체중 그래프</title>
          <desc id={descId}>{description}</desc>
          {chart.yTicks.map((t) => (
            <g key={t.label}>
              <line className="chart-grid" x1={BOX.padLeft} x2={BOX.width - BOX.padRight} y1={t.y} y2={t.y} />
              <text className="chart-axis" x={BOX.padLeft - 6} y={t.y + 5} textAnchor="end">
                {t.label}
              </text>
            </g>
          ))}
          {chart.xLabels.map((l, i) => {
            const date = days[l.index].recordDate;
            const [, m, d] = date.split('-').map(Number);
            const label = i === 0 || d === 1 ? `${m}/${d}` : String(d);
            return (
              <text key={date} className="chart-axis" x={l.x} y={BOX.height - 10} textAnchor="middle">
                {label}
              </text>
            );
          })}
          {chart.segments.map((s, i) => (
            <path key={i} d={s.d} className={s.dashed ? 'chart-line dashed' : 'chart-line'} />
          ))}
          {chart.dots.map((dot, i) => (
            <circle
              key={dot.recordDate}
              cx={dot.x}
              cy={dot.y}
              r={i === selected ? 8 : 5}
              className={i === selected ? 'chart-dot selected' : 'chart-dot'}
            />
          ))}
          {readOnly &&
            valueLabels(chart.dots).map((l) => (
              <text key={l.recordDate} className="chart-value" x={l.x} y={l.y} textAnchor="middle">
                {l.text}
              </text>
            ))}
        </svg>
      </div>
      {!readOnly && (
        <>
          <p className="muted small">{HISTORY_TEXT.scaleNote}</p>
          {chart.hasDashed && <p className="muted small">{HISTORY_TEXT.legendDashed}</p>}
          <p className="strong" aria-live="polite">
            {selectedPoint ? selectedWeightText(selectedPoint.recordDate, selectedPoint.weightKg) : ''}
          </p>
        </>
      )}
    </div>
  );
}
