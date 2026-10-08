// 반려동물 확인 결과에 따라 오늘 화면 또는 안내 화면을 보여 준다(등록·선택은 앱에 아직 없음: README 할 일 2).
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NETWORK_ERROR_MESSAGE } from '../lib/api';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { DeviceFooter } from '../today/sections/DeviceFooter';
import { colors, spacing } from '../theme';
import { usePet } from './PetProvider';

/** title: 반려동물이 없거나 불러오지 못했을 때 안내 화면의 제목(기본 "오늘"). 약 관리 화면은 "먹이는 약" */
export function PetGate({ children, title = '오늘' }: { children: ReactNode; title?: string }) {
  const { status, reload } = usePet();

  if (status === 'ready') return <>{children}</>;

  if (status === 'loading') {
    return (
      <Screen>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}
          accessibilityLabel="불러오는 중"
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="secondary">불러오는 중…</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <Card>
        {status === 'none' ? (
          <>
            <AppText style={{ fontWeight: '700' }}>웹에서 반려동물을 먼저 등록해 주세요</AppText>
            <AppText variant="secondary">등록하고 나면 이 앱에서 매일 기록할 수 있어요.</AppText>
          </>
        ) : (
          <AppText accessibilityRole="alert">
            {status === 'offline' ? NETWORK_ERROR_MESSAGE : '반려동물 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}
          </AppText>
        )}
        <AppButton label={status === 'none' ? '새로 확인' : '다시 불러오기'} variant="secondary" onPress={() => void reload()} />
      </Card>
      <DeviceFooter />
    </Screen>
  );
}
