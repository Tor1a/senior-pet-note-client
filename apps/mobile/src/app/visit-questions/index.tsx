// 진료 때 물어볼 것 라우트(/visit-questions). 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 화면
import { PetGate } from '../../pet/PetGate';
import VisitQuestionsScreen from '../../visitQuestions/VisitQuestionsScreen';

export default function VisitQuestionsRoute() {
  return (
    <PetGate title="진료 때 물어볼 것">
      <VisitQuestionsScreen />
    </PetGate>
  );
}
