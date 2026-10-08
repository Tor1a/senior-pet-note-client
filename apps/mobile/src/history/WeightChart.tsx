// 체중 선 그래프 (react-native-svg). 좌표 계산은 lib/chartGeometry.ts(웹과 공유)가 한다.
// - 축 숫자는 SVG Text 가 아니라 RN 글자(AppText)로 그려 기기 글자 크기 설정을 따른다.
// - 스크린리더: 컨테이너 하나가 "체중 그래프 + 사실 요약"을 읽고, 안쪽 요소는 숨긴다. 값은 [표로 보기]로 확인한다.
// - 터치로 고르는 기능은 없다(점이 작아 잘못 누르기 쉬움).
import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { AppText } from '../components/ui';
import { buildChart, type ChartBox } from '../lib/chartGeometry';
import { weightPoints } from '../lib/historyStats';
import { chartDescription, HISTORY_TEXT } from '../lib/historyText';
import type { HistoryDay } from '../lib/petApi';
import { colors, spacing } from '../theme';

const BASE_HEIGHT = 200;
const HUGE_FONT_SCALE = 2;
const LARGE_FONT_SCALE = 1.3;

export default function WeightChart({ days }: { days: HistoryDay[] }) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(300);
  const height = fontScale >= HUGE_FONT_SCALE ? 300 : fontScale >= LARGE_FONT_SCALE ? 260 : BASE_HEIGHT;
  const padLeft = Math.min(120, Math.round(52 * Math.max(1, fontScale)));
  const padBottom = Math.round(24 * Math.max(1, Math.min(fontScale, 2)));
  const box: ChartBox = { width, height, padLeft, padRight: 16, padTop: 16, padBottom };

  const points = useMemo(() => weightPoints(days), [days]);
  const chart = useMemo(() => buildChart(points, days.length, box), [points, days.length, width, height, padLeft, padBottom]);
  // 큰 글씨에서는 날짜 글자가 겹치지 않게 하나씩 건너뛴다(마지막 날은 유지)
  const xLabels = fontScale >= LARGE_FONT_SCALE && chart.xLabels.length > 3
    ? chart.xLabels.filter((_, i) => (chart.xLabels.length - 1 - i) % 2 === 0)
    : chart.xLabels;

  return (
    <View
      accessible
      accessibilityLabel={`${HISTORY_TEXT.weightTitle} 그래프. ${chartDescription(days)}`}
      accessibilityHint="표로 보기 버튼으로 날짜별 값을 읽을 수 있어요"
      testID="weight-chart"
      onLayout={(e) => setWidth(Math.max(200, Math.round(e.nativeEvent.layout.width)))}
      style={{ height, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: '#E8DFD4' }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>
        <Svg width={width} height={height}>
          {chart.yTicks.map((t) => (
            <Line key={t.label} x1={padLeft} x2={width - 16} y1={t.y} y2={t.y} stroke="#D9CFC3" strokeWidth={1} />
          ))}
          {chart.segments.map((s, i) => (
            <Path
              key={i}
              d={s.d}
              stroke={colors.primary}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '2 6' : undefined}
            />
          ))}
          {chart.dots.map((dot) => (
            <Circle key={dot.recordDate} cx={dot.x} cy={dot.y} r={5} fill={colors.primary} stroke="#FFFFFF" strokeWidth={2} />
          ))}
        </Svg>
        {chart.yTicks.map((t) => (
          <AppText
            key={t.label}
            variant="caption"
            style={{ position: 'absolute', left: 4, width: padLeft - 8, textAlign: 'right', top: t.y - 12 }}
          >
            {t.label}
          </AppText>
        ))}
        {xLabels.map((l, i) => {
          const [, m, d] = days[l.index].recordDate.split('-').map(Number);
          const label = i === 0 || d === 1 ? `${m}/${d}` : String(d);
          return (
            <AppText
              key={days[l.index].recordDate}
              variant="caption"
              style={{ position: 'absolute', bottom: spacing.sm / 2, left: l.x - 24, width: 48, textAlign: 'center' }}
            >
              {label}
            </AppText>
          );
        })}
      </View>
    </View>
  );
}
