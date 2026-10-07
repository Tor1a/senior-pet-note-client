import { describe, expect, it } from 'vitest';
import { isPartialPushConfig, resolvePushConfig } from './pushConfig';

const FULL = {
  VITE_FIREBASE_API_KEY: 'api-key',
  VITE_FIREBASE_PROJECT_ID: 'project',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_FIREBASE_VAPID_KEY: 'vapid-public',
};

describe('resolvePushConfig — Firebase 환경변수 점검', () => {
  it('다섯 개가 모두 있으면 켠다(앞뒤 공백 제거)', () => {
    expect(resolvePushConfig({ ...FULL, VITE_FIREBASE_APP_ID: ' 1:123:web:abc ' })).toEqual({
      enabled: true,
      firebase: { apiKey: 'api-key', projectId: 'project', messagingSenderId: '123', appId: '1:123:web:abc' },
      vapidKey: 'vapid-public',
    });
  });

  it('하나도 없으면 끈다(부분 설정 아님)', () => {
    const status = resolvePushConfig({});
    expect(status).toMatchObject({ enabled: false, reason: 'missing-config' });
    expect(isPartialPushConfig(status)).toBe(false);
  });

  it('하나라도 비거나 공백이면 끄고, 빠진 이름을 알려 준다', () => {
    const status = resolvePushConfig({ ...FULL, VITE_FIREBASE_VAPID_KEY: '  ' });
    expect(status).toEqual({ enabled: false, reason: 'missing-config', missing: ['VITE_FIREBASE_VAPID_KEY'] });
    expect(isPartialPushConfig(status)).toBe(true);
  });
});
