// 반려동물 확인 결과에 따라 오늘 화면 또는 안내 화면을 보여 준다. 반려동물이 없으면 시작 화면(PetStart)에서 등록한다.
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NETWORK_ERROR_MESSAGE } from '../lib/api';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { DeviceFooter } from '../today/sections/DeviceFooter';
import { colors, spacing } from '../theme';
import { PetStart } from './PetStart';
import { usePet } from './PetProvider';

/** 반려동물 확인 중 화면 (등록 폼도 같은 화면을 쓴다) */
export function PetLoading() {
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

/** title: 반려동물을 불러오지 못했을 때 안내 화면의 제목(기본 "오늘"). 약 관리 화면은 "먹이는 약". 반려동물이 없을 때는 모든 화면이 같은 시작 화면 */
export function PetGate({ children, title = '오늘' }: { children: ReactNode; title?: string }) {
  const { status, reload } = usePet();

  if (status === 'ready') return <>{children}</>;

  if (status === 'loading') return <PetLoading />;

  if (status === 'none') return <PetStart />;

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <Card>
        <AppText accessibilityRole="alert">
          {status === 'offline' ? NETWORK_ERROR_MESSAGE : '반려동물 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}
        </AppText>
        <AppButton label="다시 불러오기" variant="secondary" onPress={() => void reload()} />
      </Card>
      <DeviceFooter />
    </Screen>
  );
}
