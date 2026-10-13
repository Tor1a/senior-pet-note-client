// 할 일 추가 라우트
import { PetGate } from '../../pet/PetGate';
import TodoFormScreen from '../../todos/TodoFormScreen';

export default function NewTodoRoute() {
  return (
    <PetGate title="내 할 일 일정">
      <TodoFormScreen />
    </PetGate>
  );
}
