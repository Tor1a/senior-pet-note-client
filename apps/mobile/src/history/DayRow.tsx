// 날짜 줄 / 표 보기 줄: 줄 전체가 하나의 링크(높이 56 이상). 접근성 라벨은 줄 내용을 한 문장으로 읽는다.
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/ui';
import { colors, spacing } from '../theme';

export function DayRow({
  title,
  summary,
  onPress,
  dashed,
  accent,
}: {
  title: string;
  summary?: string;
  onPress: () => void;
  /** 기록 없는 날: 점선 테두리 + 보조색 */
  dashed?: boolean;
  /** 오늘(기록 중): 굵은 테두리 */
  accent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={summary ? `${title}. ${summary}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        dashed && styles.dashed,
        accent && styles.accent,
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={{ gap: 2 }}>
        <AppText style={[styles.bold, dashed && { color: colors.textSecondary }]}>{title}</AppText>
        {summary ? <AppText variant="secondary">{summary}</AppText> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dashed: { borderStyle: 'dashed' },
  accent: { borderWidth: 3, borderColor: colors.primary },
  bold: { fontWeight: '700' },
});
