// 처음 키워요 체크리스트 라우트(/checklist). 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 화면(ChecklistScreen)
import ChecklistScreen from '../checklist/ChecklistScreen';
import { PetGate } from '../pet/PetGate';

export default function ChecklistRoute() {
  return (
    <PetGate title="처음 키워요 체크리스트">
      <ChecklistScreen />
    </PetGate>
  );
}
