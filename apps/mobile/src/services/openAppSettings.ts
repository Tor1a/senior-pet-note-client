// 휴대폰 설정 앱의 이 앱 화면 열기 ([설정 열기] 버튼). 실패해도 화면은 그대로 둔다. 테스트에서 모킹하기 쉽게 분리.
import { Linking } from 'react-native';

export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // 열 수 없는 환경(웹 미리보기 등)에서는 아무 일도 하지 않는다
  }
}
