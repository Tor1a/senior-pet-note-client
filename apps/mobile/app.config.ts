// Expo 설정 (app.json 대체)
// Firebase 설정 파일(google-services.json, GoogleService-Info.plist)은 git 에 올리지 않는다.
// 파일이 있을 때만 RNFB 플러그인과 googleServicesFile 을 넣어, 파일이 없어도 prebuild·Expo Go 가 깨지지 않게 한다.

import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const BUNDLE_ID = 'com.oraegyeot.seniorpet';

// 로컬은 앱 루트의 파일, EAS 클라우드 빌드는 file secret 환경변수(값 = 업로드된 파일 경로)를 쓴다.
const androidFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const iosFile = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist';
const exists = (file: string) => fs.existsSync(path.resolve(__dirname, file));
const hasAndroid = exists(androidFile);
const hasIos = exists(iosFile);

// 플랫폼별로 따로 처리한다. 한쪽만 있으면 그쪽만 알림이 켜지고 다른 쪽은 꺼진다(경고로 알림)
if (hasAndroid !== hasIos) {
  const missing = hasAndroid ? 'GoogleService-Info.plist(iOS)' : 'google-services.json(Android)';
  // console.warn 은 expo config 평가 중 삼켜지는 경우가 있어 stderr 로 직접 쓴다
  process.stderr.write(`[알림] ${missing} 가 없어 해당 플랫폼 빌드에서는 알림이 꺼집니다.\n`);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: '시니어펫 노트',
  slug: 'senior-pet-note',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'seniorpetnote',
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    ...(hasIos && {
      googleServicesFile: iosFile,
      entitlements: { 'aps-environment': 'development' }, // 출시 빌드는 production
      infoPlist: { UIBackgroundModes: ['remote-notification'] },
    }),
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#FFFBF5',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['POST_NOTIFICATIONS'], // 안드로이드 13+ 알림 권한(런타임 요청은 push.native.ts)
    ...(hasAndroid && { googleServicesFile: androidFile }),
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ...(hasAndroid || hasIos
      ? ([
          '@react-native-firebase/app',
          '@react-native-firebase/messaging',
          // RNFB 는 iOS 에서 정적 프레임워크가 필요하다. iOS 설정 파일이 있을 때만 켠다
          ...(hasIos ? [['expo-build-properties', { ios: { useFrameworks: 'static' } }]] : []),
        ] as NonNullable<ExpoConfig['plugins']>)
      : []),
  ],
});
