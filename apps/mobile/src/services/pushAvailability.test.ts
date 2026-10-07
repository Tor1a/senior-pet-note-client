import { pushUnavailableReason } from './pushAvailability';

describe('pushUnavailableReason', () => {
  it('웹 미리보기는 사용 불가', () => {
    expect(pushUnavailableReason({ os: 'web', executionEnvironment: undefined, hasNativeModule: true })).toBe('web');
  });
  it('Expo Go 는 사용 불가', () => {
    expect(pushUnavailableReason({ os: 'android', executionEnvironment: 'storeClient', hasNativeModule: true })).toBe('expo-go');
  });
  it('개발 빌드인데 네이티브 모듈이 없으면 사용 불가', () => {
    expect(pushUnavailableReason({ os: 'android', executionEnvironment: 'bare', hasNativeModule: false })).toBe('no-native-module');
  });
  it('개발 빌드 + 모듈 있음이면 사용 가능', () => {
    expect(pushUnavailableReason({ os: 'ios', executionEnvironment: 'bare', hasNativeModule: true })).toBeNull();
  });
});
