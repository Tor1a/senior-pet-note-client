// S3 알림 허용 사전 안내 (설계 7장). OS 권한 창은 이 안의 [알림 허용하기]를 눌러야만 띄운다.
// - 뒤쪽 화면은 읽히지 않게(accessibilityViewIsModal), 열리면 제목으로 접근성 포커스, Android 뒤로가기 = [나중에].
// - 큰 글씨에서는 안쪽이 스크롤되고 버튼은 맨 아래에 고정된다.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, AppText, LinkButton } from '../../components/ui';
import { colors, spacing } from '../../theme';

export function PermissionModal({ medName, onAllow, onLater }: { medName: string; onAllow: () => void; onLater: () => void }) {
  const titleRef = useRef<View>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <Modal transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.body}>
            <View ref={titleRef} accessible accessibilityRole="header">
              <AppText variant="title">약 먹일 시간에 알려 드릴게요</AppText>
            </View>
            <AppText>{`${medName ? `${medName}을(를) ` : '약을 '}먹일 시각이 되면 이 휴대폰으로 알림을 보내요.`}</AppText>
            <AppText variant="secondary">잠금화면에 반려동물과 약 이름이 보여요.</AppText>
            <AppText style={styles.bold}>다음 화면에서 [허용]을 눌러 주세요.</AppText>
          </ScrollView>
          <View style={styles.actions}>
            <AppButton label="알림 허용하기" onPress={onAllow} />
            <LinkButton label="나중에" onPress={onLater} center />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: 'rgba(43,36,32,0.5)' },
  dialog: { maxHeight: '90%', borderRadius: 16, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface },
  body: { gap: spacing.sm },
  actions: { gap: spacing.sm },
  bold: { fontWeight: '700' },
});
