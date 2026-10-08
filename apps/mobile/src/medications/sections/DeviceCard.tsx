// 이 기기에서 못 받을 때 안내 카드 (설계 8장). 푸시 상태별로 하나만 보인다.
// registered / registering / checking 이면 카드가 없다. default 는 저장된 규칙이 켜짐일 때만 보인다.
import { useState } from 'react';
import { Platform } from 'react-native';
import { NoticeCard } from '../../components/NoticeCard';
import { AppButton, AppText, LinkButton } from '../../components/ui';
import type { PushDeviceState } from '../../push/pushContext';

export function DeviceCard({
  state,
  savedEnabled,
  onAllow,
  onRetry,
  onOpenSettings,
}: {
  state: PushDeviceState;
  savedEnabled: boolean;
  onAllow: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  switch (state) {
    case 'default':
      if (!savedEnabled) return null;
      return (
        <NoticeCard kind="info">
          <AppText style={{ fontWeight: '700' }}>이 기기에서는 아직 알림을 받을 수 없어요.</AppText>
          <AppButton label="알림 허용하기" onPress={onAllow} />
        </NoticeCard>
      );
    case 'denied':
      return (
        <NoticeCard kind="info">
          <AppText style={{ fontWeight: '700' }}>이 기기에서 알림이 꺼져 있어요.</AppText>
          <AppText>휴대폰 설정에서 이 앱의 알림을 켜야 받을 수 있어요.</AppText>
          <AppButton label="설정 열기" variant="secondary" onPress={onOpenSettings} />
          <AppText variant="secondary">설정에서 알림을 켜고 돌아오면 자동으로 확인해요.</AppText>
          <LinkButton
            label={stepsOpen ? '켜는 방법 닫기 ▴' : '켜는 방법 보기 ▾'}
            accessibilityLabel={stepsOpen ? '켜는 방법 닫기' : '켜는 방법 보기'}
            onPress={() => setStepsOpen((v) => !v)}
          />
          {stepsOpen ? (
            <AppText>
              {Platform.OS === 'ios'
                ? 'iPhone: 설정 > 알림 > 시니어펫 노트 > 알림 허용을 켜요.'
                : 'Android: 설정 > 알림(또는 앱 > 알림)을 켜요.'}
            </AppText>
          ) : null}
        </NoticeCard>
      );
    case 'unavailable':
      return (
        <NoticeCard kind="info">
          <AppText style={{ fontWeight: '700' }}>이 앱에서는 아직 알림을 받을 수 없어요.</AppText>
          <AppText>알림 설정은 저장해 둘 수 있어요.</AppText>
          <AppText>알림이 준비된 앱에서 받게 돼요.</AppText>
        </NoticeCard>
      );
    case 'error':
      return (
        <NoticeCard kind="info">
          <AppText style={{ fontWeight: '700' }}>이 기기를 알림 받을 기기로 등록하지 못했어요.</AppText>
          <AppButton label="다시 시도" variant="secondary" onPress={onRetry} />
        </NoticeCard>
      );
    default:
      return null;
  }
}
