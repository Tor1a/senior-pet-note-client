// 확인 카드 틀 (설계 .company/design/저장-되돌리기.md 7-3). 체중 숫자 확인(인라인)이 쓴다. 웹 components/ConfirmCard 와 같은 규칙.
// - 제목·본문·버튼 2개. 안전한 쪽이 위·주 버튼(primary 56), 반대쪽은 secondary 48. 버튼은 항상 세로.
// - 열리면 접근성 포커스를 제목으로 옮기고(스크린리더), 카드 전체는 alert 로 읽힌다. 새 색 없음(NoticeCard info 모양).
import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { NoticeCard } from './NoticeCard';
import { AppButton, AppText } from './ui';

export interface ConfirmCardProps {
  title: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /** 스크린리더가 카드에 들어올 때 읽을 전체 문장(없으면 제목) */
  speech?: string;
  disabled?: boolean;
  /** 카드가 처음 그려질 때 한 번 불린다(화면이 카드 위치로 스크롤하는 데 쓴다) */
  onShown?: (node: View) => void;
}

export function ConfirmCard({
  title,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  speech,
  disabled = false,
  onShown,
}: ConfirmCardProps) {
  const ref = useRef<View>(null);
  const shown = useRef(onShown);
  shown.current = onShown;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    shown.current?.(node);
    const tag = findNodeHandle(node);
    if (tag) AccessibilityInfo.setAccessibilityFocus?.(tag);
  }, []);

  return (
    <NoticeCard kind="info" alert>
      <View ref={ref} accessible accessibilityLabel={speech ?? title} collapsable={false}>
        <AppText accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
      </View>
      {children}
      <AppButton label={primaryLabel} onPress={onPrimary} disabled={disabled} />
      <AppButton label={secondaryLabel} variant="secondary" onPress={onSecondary} disabled={disabled} />
    </NoticeCard>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: spacing.sm },
});
