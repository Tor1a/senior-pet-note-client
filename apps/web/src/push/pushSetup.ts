// 앱이 쓰는 푸시 설정값 하나 (환경변수 → resolvePushConfig)
import { isPartialPushConfig, resolvePushConfig } from '../lib/pushConfig';

export const pushConfig = resolvePushConfig(import.meta.env);

// 일부만 채운 경우 오타일 수 있으므로 한 번만 알린다(값은 출력하지 않는다)
if (isPartialPushConfig(pushConfig) && !pushConfig.enabled) {
  console.warn(`[알림] Firebase 환경변수가 일부 비어 있어 알림을 끕니다: ${pushConfig.missing.join(', ')}`);
}
