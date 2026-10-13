// 할 일 목록 라우트. 얇게 유지한다: 반려동물 확인(PetGate) 뒤에 목록 화면
import { PetGate } from '../../pet/PetGate';
import TodosScreen from '../../todos/TodosScreen';

export default function TodosRoute() {
  return (
    <PetGate title="내 할 일 일정">
      <TodosScreen />
    </PetGate>
  );
}
