// 폼의 "이 기기 알림" 상태 한 줄 (기획서 6-1, 설계 4-4). 허용됨이면 사실만, 아니면 사실 + 필요한 버튼 하나.
// 권한 창은 [알림 허용하기] 버튼에서만 띄운다(폼을 열거나 저장할 때 묻지 않는다). 알림이 막혀 있어도 할 일은 저장된다.
import { useState } from 'react';
import { AppButton, AppText, Card } from '../components/ui';
import { TODO_TEXT } from '../lib/todoText';
import { usePush } from '../push/pushContext';
import { openAppSettings } from '../services/openAppSettings';
import { TODO_MOBILE_TEXT } from './todoMobileText';

export function TodoDeviceLine({ onAllowed }: { onAllowed?: () => void }) {
  const { state, requestPermission, recheck } = usePush();
  const [asking, setAsking] = useState(false);
  const T = TODO_TEXT;

  async function run(fn: () => Promise<string>) {
    setAsking(true);
    try {
      const result = await fn();
      if (result === 'registered') onAllowed?.();
    } finally {
      setAsking(false);
    }
  }

  switch (state) {
    case 'registered':
    case 'registering':
      return <AppText accessibilityLiveRegion="polite">{T.deviceRegistered}</AppText>;
    case 'checking':
      return <AppText variant="secondary">{T.deviceChecking}</AppText>;
    case 'default':
      return (
        <Card>
          <AppText>{T.deviceDefault}</AppText>
          <AppButton label={T.deviceAllow} variant="secondary" loading={asking} onPress={() => void run(requestPermission)} />
        </Card>
      );
    case 'denied':
      return (
        <Card>
          <AppText>{T.deviceDenied}</AppText>
          <AppButton label={TODO_MOBILE_TEXT.openSettings} variant="secondary" onPress={() => void openAppSettings()} />
        </Card>
      );
    case 'error':
      return (
        <Card>
          <AppText>{T.deviceError}</AppText>
          <AppButton label={T.deviceRetry} variant="secondary" loading={asking} onPress={() => void run(recheck)} />
        </Card>
      );
    default:
      return <AppText variant="secondary">{T.deviceUnavailable}</AppText>;
  }
}
