// 약 목록 라우트. 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 화면(MedicationsScreen)
import MedicationsScreen from '../../medications/MedicationsScreen';
import { PetGate } from '../../pet/PetGate';

export default function MedicationsRoute() {
  return (
    <PetGate title="먹이는 약">
      <MedicationsScreen />
    </PetGate>
  );
}
