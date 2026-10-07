// 푸시 플랫폼 구현(push.ts 비활성 / push.native.ts RNFB)이 공유하는 형태

export type PermissionState = 'granted' | 'denied' | 'default';

export interface PushPlatform {
  /** false 면 아래 함수는 모두 아무 일도 하지 않는다 */
  available: boolean;
  getPermission(): Promise<PermissionState>;
  /** 사용자가 버튼을 누른 뒤에만 부른다 */
  requestPermission(): Promise<PermissionState>;
  getToken(): Promise<string>;
  deleteToken(): Promise<void>;
  onTokenRefresh(listener: (token: string) => void): () => void;
  /** 앱이 앞에 떠 있을 때 받은 알림 */
  onForeground(listener: (message: PushMessage) => void): () => void;
  /** 백그라운드 알림을 눌러 앱이 열렸을 때 */
  onOpened(listener: (message: PushMessage) => void): () => void;
  /** 종료 상태에서 알림을 눌러 앱이 시작됐을 때(한 번) */
  getInitial(): Promise<PushMessage | null>;
}

export interface PushMessage {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}
