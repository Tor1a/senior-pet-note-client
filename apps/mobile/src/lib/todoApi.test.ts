// [공유 로직 테스트 사본] 원본: web/src/lib/todoApi.test.ts (2026-10-13 복사)
// 웹 원본에서 첫 줄 vitest import 를 제거하고 vi.fn 을 jest.fn 으로 바꿨다(나머지 본문은 동일).
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { createApiClient } from './api';
import { createTodoApi, parseTodoReminderData } from './todoApi';
import { todoExample, todoListExample } from './todoFixtures';

function setup(respond: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond(String(input), init ?? {});
  }) as unknown as typeof fetch;
  const api = createTodoApi(createApiClient({ baseUrl: 'https://api.test', getToken: () => 'tok', fetchImpl }));
  return { api, calls };
}
const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('todoApi — 기획서 5장 계약', () => {
  it('목록: status 생략은 쿼리 없음, open/done 은 status 쿼리', async () => {
    const { api, calls } = setup(() => json(200, todoListExample([todoExample()])));
    const res = await api.listTodos('pet-1');
    expect(res.todos[0].dateStatus).toBe('future');
    await api.listTodos('pet-1', 'done');
    await api.listTodos('pet-1', 'open');
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.test/api/pets/pet-1/todos',
      'https://api.test/api/pets/pet-1/todos?status=done',
      'https://api.test/api/pets/pet-1/todos?status=open',
    ]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('등록: POST 본문 그대로, 201 Todo', async () => {
    const { api, calls } = setup(() => json(201, todoExample()));
    const input = { title: '광견병 접종', dueDate: '2026-10-20', dueTime: null, memo: null, hospitalNote: null, remind: true };
    const created = await api.createTodo('pet-1', input);
    expect(created.id).toBe('todo-1');
    expect(calls[0].url).toBe('https://api.test/api/pets/pet-1/todos');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input);
  });

  it('수정·완료·삭제 경로와 메서드', async () => {
    const { api, calls } = setup((_u, init) => (init.method === 'DELETE' ? json(204, null) : json(200, todoExample())));
    await api.updateTodo('a/b', { title: 'x', dueDate: '2026-10-20' });
    await api.setTodoCompleted('todo-1', true);
    await api.setTodoCompleted('todo-1', false);
    await api.deleteTodo('todo-1');
    expect(calls.map((c) => `${c.init.method} ${c.url.replace('https://api.test', '')}`)).toEqual([
      'PUT /api/todos/a%2Fb',
      'PUT /api/todos/todo-1/completion',
      'PUT /api/todos/todo-1/completion',
      'DELETE /api/todos/todo-1',
    ]);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ completed: true });
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ completed: false });
  });
});

describe('parseTodoReminderData', () => {
  const data = { type: 'todo_reminder', todoId: 't1', petId: 'p1', dueDate: '2026-10-20', kind: 'day_before' };
  it('필수 필드가 있으면 읽고, dueTime 은 있을 때만', () => {
    expect(parseTodoReminderData(data)).toEqual({ ...data, dueTime: null });
    expect(parseTodoReminderData({ ...data, kind: 'due_day', dueTime: '14:30' })?.dueTime).toBe('14:30');
  });
  it('다른 type·빠진 필드·알 수 없는 kind·잘못된 입력은 null', () => {
    expect(parseTodoReminderData({ ...data, type: 'med_reminder' })).toBeNull();
    expect(parseTodoReminderData({ ...data, todoId: '' })).toBeNull();
    expect(parseTodoReminderData({ ...data, kind: 'later' })).toBeNull();
    expect(parseTodoReminderData(null)).toBeNull();
    expect(parseTodoReminderData('x')).toBeNull();
  });
});
