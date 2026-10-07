// 푸시 "비활성" 구현(공용). push.ts(웹·기본)와 push.native.ts(RNFB 를 못 쓸 때 대체)가 함께 쓴다.
// 주의: push.native.ts 가 './push' 를 import 하면 Metro 가 네이티브에서 같은 파일(push.native.ts)을 골라
// 자기 자신을 불러오는 순환 참조(Require cycle: push.native.ts -> push.native.ts)가 생긴다 → 이 파일로 분리했다.
import type { PushPlatform } from './pushTypes';

export const push: PushPlatform = {
  available: false,
  getPermission: async () => 'default',
  requestPermission: async () => 'default',
  getToken: async () => '',
  deleteToken: async () => {},
  onTokenRefresh: () => () => {},
  onForeground: () => () => {},
  onOpened: () => () => {},
  getInitial: async () => null,
};
