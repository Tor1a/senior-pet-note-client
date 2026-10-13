// 예정 목록을 서버가 계산한 dateStatus 로 묶는다. 날짜 비교는 하지 않는다(기획서 5-1, 6-4). 순수 TS(모바일 사본 대상).
import { TODO_DATE_STATUSES, type Todo, type TodoDateStatus } from './todoApi';

export interface TodoGroup {
  status: TodoDateStatus;
  todos: Todo[];
}

/** 지난 일정 → 오늘 → 내일 → 그 이후 순서. 비어 있는 묶음은 뺀다. 묶음 안 순서는 서버 정렬 그대로 */
export function groupByDateStatus(todos: Todo[]): TodoGroup[] {
  return TODO_DATE_STATUSES.map((status) => ({ status, todos: todos.filter((t) => t.dateStatus === status) })).filter(
    (g) => g.todos.length > 0,
  );
}

/** 목록에서 id 를 바꿔 끼운다(없으면 그대로) */
export function replaceTodo(todos: Todo[], next: Todo): Todo[] {
  return todos.map((t) => (t.id === next.id ? next : t));
}

export function removeTodo(todos: Todo[], id: string): Todo[] {
  return todos.filter((t) => t.id !== id);
}
