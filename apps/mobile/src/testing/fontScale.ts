// 컴포넌트 테스트에서 기기 글자 배율을 바꾼다(jest 기본값은 2 라서 평소 배치를 보려면 1 로 맞춘다)
import { Dimensions } from 'react-native';

export function setFontScale(fontScale: number) {
  Dimensions.set({
    window: { ...Dimensions.get('window'), fontScale },
    screen: { ...Dimensions.get('screen'), fontScale },
  });
}
