// 되돌리기 안내 (설계 .company/design/저장-되돌리기.md 3-6, 8장). 일일 기록 저장 되돌리기와 투약 [다시 체크]가 함께 쓴다. 웹 components/UndoNotice 와 같은 규칙.
// - ok 는 NoticeCard ok(✓ 글자 + 초록 테두리), 실패(error)는 NoticeCard info(ⓘ 안내, 바로 읽음). 새 색·토스트 없음.
// - autoDismissMs 가 있으면 그 시간 뒤 onDismiss. 화면에 손을 대고 있는 동안은 멈추고, 스크린리더가 켜져 있으면 자동으로 사라지지 않는다(닫을 때까지 유지).
// - 되돌리기 버튼이 있는 안내는 시간 제한을 두지 않는다(autoDismissMs 생략). 글자 배율 1.3 이상이면 버튼을 세로로 쌓는다.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { isLargeFont } from '../medications/layout';
import { spacing } from '../theme';
import { NoticeCard, NoticeTitle } from './NoticeCard';
import { AppButton, AppText } from './ui';

export interface UndoNoticeProps {
  message: string;
  /** ok: 성공·결과 / error: 되돌리지 못함(바로 읽음) */
  tone?: 'ok' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  /** 되돌리는 중: 버튼 이름을 busyLabel 로 바꾸고 누를 수 없게 한다 */
  busy?: boolean;
  busyLabel?: string;
  /** 다른 작업(저장 중 등) 때문에 지금은 누를 수 없음: 버튼을 비활성(접근성 상태 포함)으로 하고 disabledNote 를 보여 준다 */
  disabled?: boolean;
  disabledNote?: string;
  closeLabel?: string;
  onClose?: () => void;
  autoDismissMs?: number;
  onDismiss?: () => void;
}

export function UndoNotice({
  message,
  tone = 'ok',
  actionLabel,
  onAction,
  busy = false,
  busyLabel,
  disabled = false,
  disabledNote,
  closeLabel = '닫기',
  onClose,
  autoDismissMs,
  onDismiss,
}: UndoNoticeProps) {
  const { fontScale } = useWindowDimensions();
  const [touching, setTouching] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled?.()?.then((on) => alive && setScreenReader(on));
    return () => {
      alive = false;
    };
  }, []);

  // iOS 는 liveRegion 이 없어서 한 번만 읽어 준다(Android 는 NoticeCard 의 liveRegion 이 읽는다: 두 번 읽히지 않게 한쪽만)
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility?.(message);
  }, [message]);

  useEffect(() => {
    if (!autoDismissMs || touching || screenReader) return;
    const t = setTimeout(() => dismissRef.current?.(), autoDismissMs);
    return () => clearTimeout(t);
  }, [autoDismissMs, touching, screenReader, message]);

  const showClose = !!onClose || (!!autoDismissMs && screenReader);
  return (
    <View onTouchStart={() => setTouching(true)} onTouchEnd={() => setTouching(false)} onTouchCancel={() => setTouching(false)}>
      <NoticeCard kind={tone === 'ok' ? 'ok' : 'info'} alert={tone === 'error'}>
        <NoticeTitle ok={tone === 'ok'}>{message}</NoticeTitle>
        {actionLabel && disabled && !!disabledNote && <AppText variant="secondary">{disabledNote}</AppText>}
        {(actionLabel || showClose) && (
          <View style={[styles.actions, isLargeFont(fontScale) && styles.actionsStacked]}>
            {actionLabel && (
              <View style={styles.cell}>
                <AppButton
                  label={busy ? (busyLabel ?? actionLabel) : actionLabel}
                  variant="secondary"
                  disabled={busy || disabled}
                  onPress={() => onAction?.()}
                />
              </View>
            )}
            {showClose && (
              <View style={styles.cell}>
                <AppButton label={closeLabel} variant="secondary" onPress={() => (onClose ?? onDismiss)?.()} />
              </View>
            )}
          </View>
        )}
      </NoticeCard>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionsStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
  cell: { flexGrow: 1, flexBasis: 120 },
});
