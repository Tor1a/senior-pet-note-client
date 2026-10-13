// 내 할 일 일정 API (계약: .company/plans/내-할-일-일정.md 5장 → 백엔드 senior-pet-note-api/docs/api-todos.md)
// - 날짜 비교(dateStatus)와 기록 날짜(recordDate)는 서버가 계산한다. 클라이언트는 받은 값을 표시만 한다.
// - 계약을 바꾸려면 비서실장에게 먼저 알린다. 여기서 임의로 필드를 바꾸지 않는다.
// - 순수 TS(모바일 사본 대상).
import type { ApiClient } from './api';

/** 서버가 현재 기록 날짜와 dueDate 를 비교한 결과(완료 항목에도 내려온다) */
export type TodoDateStatus = 'past' | 'today' | 'tomorrow' | 'future';

export const TODO_DATE_STATUSES: readonly TodoDateStatus[] = ['past', 'today', 'tomorrow', 'future'];

/** GET 목록 필터. 생략하면 서버는 open */
export type TodoStatus = 'open' | 'done';

/** POST /api/pets/{petId}/todos, PUT /api/todos/{id} 본문 (PUT 은 전체 교체) */
export interface TodoInput {
  /** 앞뒤 공백 제거 후 1~40자(코드 포인트) */
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** HH:mm. 없으면 null(생략과 같다) */
  dueTime?: string | null;
  /** 일정 메모 200자 이하. 빈 값은 null */
  memo?: string | null;
  /** 병원 메모 500자 이하. 빈 값은 null */
  hospitalNote?: string | null;
  /** 생략하면 서버는 true */
  remind?: boolean;
}

export interface Todo {
  id: string;
  petId: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  memo: string | null;
  hospitalNote: string | null;
  remind: boolean;
  completed: boolean;
  /** ISO-8601 UTC. 미완료면 null */
  completedAt: string | null;
  dateStatus: TodoDateStatus;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/pets/{petId}/todos 응답 */
export interface TodoListResponse {
  /** 서버의 현재 기록 날짜 */
  recordDate: string;
  todos: Todo[];
}

/** 푸시 data (값은 모두 문자열). 제목·메모는 싣지 않는다 */
export type TodoReminderKind = 'day_before' | 'due_day';

export interface TodoReminderData {
  type: 'todo_reminder';
  todoId: string;
  petId: string;
  dueDate: string;
  kind: TodoReminderKind;
  /** HH:mm, 있을 때만 */
  dueTime: string | null;
}

/** 알 수 없는 알림은 무시한다(type 이 다르거나 필수 필드가 빠졌으면 null) */
export function parseTodoReminderData(data: unknown): TodoReminderData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'todo_reminder') return null;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const kind = str('kind');
  if (kind !== 'day_before' && kind !== 'due_day') return null;
  const out: TodoReminderData = {
    type: 'todo_reminder',
    todoId: str('todoId'),
    petId: str('petId'),
    dueDate: str('dueDate'),
    kind,
    dueTime: str('dueTime') || null,
  };
  if (!out.todoId || !out.petId || !out.dueDate) return null;
  return out;
}

/** 알림을 눌렀을 때(서비스워커·인앱 배너) 여는 곳 */
export const TODOS_PUSH_PATH = '/todos?source=push';

const enc = encodeURIComponent;

export function createTodoApi(client: ApiClient) {
  return {
    /** status 생략 = open. done 은 최근 완료 순 최대 100개 */
    listTodos: (petId: string, status?: TodoStatus) =>
      client.request<TodoListResponse>(`/api/pets/${enc(petId)}/todos${status ? `?status=${status}` : ''}`),
    createTodo: (petId: string, input: TodoInput) =>
      client.request<Todo>(`/api/pets/${enc(petId)}/todos`, { method: 'POST', body: input }),
    updateTodo: (id: string, input: TodoInput) =>
      client.request<Todo>(`/api/todos/${enc(id)}`, { method: 'PUT', body: input }),
    /** 멱등. 이미 완료인데 true 를 다시 보내도 최초 completedAt 이 유지된다 */
    setTodoCompleted: (id: string, completed: boolean) =>
      client.request<Todo>(`/api/todos/${enc(id)}/completion`, { method: 'PUT', body: { completed } }),
    /** 실제 삭제(204). 남의 것·없는 것은 404 */
    deleteTodo: (id: string) => client.request<null>(`/api/todos/${enc(id)}`, { method: 'DELETE' }),
  };
}

export type TodoApi = ReturnType<typeof createTodoApi>;
