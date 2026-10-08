// 약 카드의 알림 상태 줄 (설계 3-2). 줄 전체가 버튼이라 누르면 알림 설정으로 간다.
// 켜짐/꺼짐은 색만이 아니라 글자와 기호(▣ 켜짐 / □ 꺼짐)로도 구분한다(이모지 대신, 기획 Q8).
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/ui';
import type { Reminder } from '../../lib/reminderApi';
import { reminderStatus, reminderStatusLabel } from '../../lib/reminderForm';
import { colors, spacing, touch } from '../../theme';

export function ReminderStatusLine({
  medName,
  medTimes,
  reminder,
  deviceCannotReceive,
  onPress,
}: {
  medName: string;
  medTimes: string[];
  /** 'error' 면 줄을 숨긴다([알림 설정] 버튼은 카드에 그대로) */
  reminder: Reminder | 'error' | undefined;
  deviceCannotReceive: boolean;
  onPress: () => void;
}) {
  if (reminder === 'error') return null;
  if (!reminder) {
    return (
      <AppText variant="secondary" accessibilityState={{ busy: true }}>
        알림 확인 중…
      </AppText>
    );
  }
  const status = reminderStatus(reminder);
  const showDeviceLine = status.kind === 'on' && deviceCannotReceive;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reminderStatusLabel(medName, medTimes, status, showDeviceLine)}
      onPress={onPress}
      style={({ pressed }) => [styles.line, status.kind === 'on' && styles.on, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <AppText style={status.kind === 'on' ? styles.bold : undefined}>
          {`${status.kind === 'off' ? '□ ' : '▣ '}${status.text}`}
        </AppText>
        {showDeviceLine ? <AppText style={styles.bold}>이 기기에서는 받을 수 없어요</AppText> : null}
      </View>
      <AppText accessibilityElementsHidden importantForAccessibility="no">
        ›
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    minHeight: touch.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  on: { borderWidth: 2, borderColor: colors.done, backgroundColor: '#EEF5F1' },
  pressed: { opacity: 0.7 },
  text: { flex: 1 },
  bold: { fontWeight: '700' },
});
