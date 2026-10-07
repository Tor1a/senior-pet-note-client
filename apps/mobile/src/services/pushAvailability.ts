// 이 실행 환경에서 푸시 알림(RNFB)을 쓸 수 있는지 판정 (순수 함수, 테스트 대상)
// - Expo Go 는 네이티브 모듈이 없어 RNFB 를 불러오는 순간 앱이 죽으므로 아예 불러오지 않는다.
// - 웹 미리보기는 push.ts(비활성 구현)가 쓰이므로 여기까지 오지 않지만, 안전하게 한 번 더 막는다.

export type PushUnavailableReason = 'web' | 'expo-go' | 'no-native-module';

export function pushUnavailableReason(env: {
  os: string;
  /** expo-constants 의 executionEnvironment ('storeClient' = Expo Go) */
  executionEnvironment: string | undefined;
  /** 네이티브 Firebase 모듈이 앱에 들어 있는지(설정 파일 없이 빌드하면 false) */
  hasNativeModule: boolean;
}): PushUnavailableReason | null {
  if (env.os === 'web') return 'web';
  if (env.executionEnvironment === 'storeClient') return 'expo-go';
  if (!env.hasNativeModule) return 'no-native-module';
  return null;
}
