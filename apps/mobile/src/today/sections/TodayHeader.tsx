// 날짜 · 반려동물 줄. 사진 표시는 아직 없어 이름 첫 글자 아바타를 쓴다(README 할 일 2)
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/ui';
import { colors, spacing } from '../../theme';

export function TodayHeader({ dateText, petName, info }: { dateText: string; petName: string; info: string }) {
  return (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header">
        {dateText}
      </AppText>
      <View style={styles.petLine}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppText style={styles.initial}>{petName.slice(0, 1)}</AppText>
        </View>
        <AppText style={styles.info}>{info}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  petLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: colors.onPrimary, fontWeight: '700' },
  info: { flexShrink: 1 },
});
