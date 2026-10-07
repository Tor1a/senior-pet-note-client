// "오늘" 화면 라우트. 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 오늘 화면(TodayScreen)
import { PetGate } from '../pet/PetGate';
import TodayScreen from '../today/TodayScreen';

export default function TodayRoute() {
  return (
    <PetGate>
      <TodayScreen />
    </PetGate>
  );
}
