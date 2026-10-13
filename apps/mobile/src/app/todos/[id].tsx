// 할 일 보기·고치기 라우트
import { useLocalSearchParams } from 'expo-router';
import { PetGate } from '../../pet/PetGate';
import TodoFormScreen from '../../todos/TodoFormScreen';

export default function EditTodoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PetGate title="내 할 일 일정">
      <TodoFormScreen todoId={Array.isArray(id) ? id[0] : id} />
    </PetGate>
  );
}
