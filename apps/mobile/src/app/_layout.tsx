// 루트 레이아웃: 로그인 상태에 따라 볼 수 있는 화면을 나눈다.
// Stack.Protected 의 guard 가 false 가 되면 그 안의 화면은 접근할 수 없고,
// 접근 가능한 첫 화면으로 자동 이동한다(로그인 성공 → 오늘, 로그아웃·401 → 로그인).

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { AppText } from '../components/ui';
import { colors, spacing } from '../theme';

function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background }}
        accessibilityLabel="로그인 정보를 확인하는 중"
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText>잠시만 기다려 주세요</AppText>
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
