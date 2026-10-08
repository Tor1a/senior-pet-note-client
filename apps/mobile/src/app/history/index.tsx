// 지난 기록 라우트(/history). 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 화면(HistoryScreen)
import HistoryScreen from '../../history/HistoryScreen';
import { PetGate } from '../../pet/PetGate';

export default function HistoryRoute() {
  return (
    <PetGate title="지난 기록">
      <HistoryScreen />
    </PetGate>
  );
}
