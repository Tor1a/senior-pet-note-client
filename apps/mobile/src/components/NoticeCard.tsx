// 안내 카드: 성공(ok: 초록 테두리 + ✓)·안내(info: 테두리 + ⓘ). 웹의 .ok / .error 카드에 해당한다.
// 빨강은 쓰지 않고, 종류는 색만이 아니라 글자 기호(✓ / ⓘ 안내)로도 알린다.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { AppText } from './ui';

export function NoticeCard({
  kind,
  children,
  alert,
}: {
  kind: 'ok' | 'info';
  children: ReactNode;
  /** 오류처럼 바로 읽어야 하는 안내 */
  alert?: boolean;
}) {
  return (
    <View
      style={[styles.card, kind === 'ok' ? styles.ok : styles.info]}
      accessibilityRole={alert ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      {kind === 'info' ? (
        <AppText variant="secondary" style={styles.tag}>
          ⓘ 안내
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

/** 카드 안의 한 줄. ok 카드는 첫 줄 앞에 ✓ 를 붙인다 */
export function NoticeTitle({ children, ok }: { children: string; ok?: boolean }) {
  return <AppText style={styles.bold}>{ok ? `✓ ${children}` : children}</AppText>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 2 },
  ok: { borderColor: colors.done, backgroundColor: '#EEF5F1' },
  info: { borderColor: colors.border, backgroundColor: colors.background },
  tag: { fontWeight: '700' },
  bold: { fontWeight: '700' },
});
