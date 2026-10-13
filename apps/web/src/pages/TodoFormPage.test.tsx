// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todoExample, todoListExample } from '../lib/todoFixtures';
import { TODO_TEXT } from '../lib/todoText';
import { setToken } from '../lib/tokenStorage';
import { json, mockServer, pushValue, renderTodos } from './todoTestKit';

// 할 일 추가·보기·고치기 화면 (기획서 W4): 계약 예시 JSON, fetch 가짜.

const TODO = todoExample({ id: 't1', title: '광견병 접종', dueDate: '2026-10-20', dueTime: '15:00', memo: '수첩', hospitalNote: null });

beforeEach(() => {
  setToken('test-token');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const setDate = (value: string) => fireEvent.change(screen.getByLabelText(TODO_TEXT.fieldDate), { target: { value } });

describe('할 일 추가', () => {
  it('처음에는 날짜·시각이 비어 있고 알림이 켜져 있다. 제목 예시·추천 버튼이 없다', async () => {
    mockServer({});
    renderTodos('/todos/new');
    const title = (await screen.findByLabelText(TODO_TEXT.fieldTitle)) as HTMLInputElement;
    expect(title.placeholder).toBe('');
    expect((screen.getByLabelText(TODO_TEXT.fieldDate) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(TODO_TEXT.fieldTime) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('하루 전 오후 8:00, 당일 오전 9:00에 알려 드려요.')).toBeTruthy();
    expect(screen.getByText(/추천하지 않아요/)).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    // 새로 만들 때는 병원 메모 칸이 없다(방문 뒤 수정 화면에서 적는다)
    expect(screen.queryByLabelText(TODO_TEXT.fieldHospitalNote)).toBeNull();
    // 칩 버튼 없음
    expect(screen.queryByRole('button', { name: /^(접종|구충|검진)$/ })).toBeNull();
  });

  it('검증: 제목 비움·날짜 미선택 오류, 41자 오류, 서버 호출 없음', async () => {
    const user = userEvent.setup();
    const calls = mockServer({});
    renderTodos('/todos/new');
    await user.click(await screen.findByRole('button', { name: TODO_TEXT.saveNew }));
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent)).toContain(TODO_TEXT.summaryProblem);
    expect(screen.getByText('제목을 적어 주세요.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(TODO_TEXT.fieldTitle));

    await user.type(screen.getByLabelText(TODO_TEXT.fieldTitle), '접종');
    expect(screen.queryByText('제목을 적어 주세요.')).toBeNull(); // 입력을 시작하면 오류가 사라진다
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));
    expect(await screen.findByText('날짜를 골라 주세요.')).toBeTruthy();

    await user.clear(screen.getByLabelText(TODO_TEXT.fieldTitle));
    await user.click(screen.getByLabelText(TODO_TEXT.fieldTitle));
    await user.paste('가'.repeat(41));
    setDate('2026-10-20');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));
    expect(await screen.findByText('제목은 40자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('등록: 본문(빈 값 null)을 보내고 목록으로 가서 안내한다', async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      'POST /api/pets/pet-1/todos': (body) => json(201, { ...TODO, ...(body as object) }),
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODO])),
    });
    renderTodos('/todos/new');
    await user.type(await screen.findByLabelText(TODO_TEXT.fieldTitle), '  광견병 접종 ');
    setDate('2026-10-20');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
    expect((await screen.findByRole('status')).textContent).toContain(TODO_TEXT.created);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      title: '광견병 접종',
      dueDate: '2026-10-20',
      dueTime: null,
      memo: null,
      hospitalNote: null,
      remind: true,
    });
  });

  it('시각·메모·알림 끔을 담아 보낸다', async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      'POST /api/pets/pet-1/todos': () => json(201, TODO),
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])),
    });
    renderTodos('/todos/new');
    await user.type(await screen.findByLabelText(TODO_TEXT.fieldTitle), '검진');
    setDate('2026-11-02');
    fireEvent.change(screen.getByLabelText(TODO_TEXT.fieldTime), { target: { value: '09:30' } });
    await user.type(screen.getByLabelText(TODO_TEXT.fieldMemo), '병원 이름');
    await user.click(screen.getByRole('switch'));
    expect(screen.getByText(TODO_TEXT.remindOffInfo)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      title: '검진',
      dueDate: '2026-11-02',
      dueTime: '09:30',
      memo: '병원 이름',
      hospitalNote: null,
      remind: false,
    });
  });

  it('저장 중에는 버튼이 잠기고 요청은 한 번만 간다', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const calls = mockServer({
      'POST /api/pets/pet-1/todos': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(201, TODO));
        }),
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])),
    });
    renderTodos('/todos/new');
    await user.type(await screen.findByLabelText(TODO_TEXT.fieldTitle), '검진');
    setDate('2026-11-02');
    const submit = screen.getByRole('button', { name: TODO_TEXT.saveNew });
    await user.click(submit);
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saving }));
    expect((screen.getByRole('button', { name: TODO_TEXT.saving }) as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('서버 오류(400·한도 409·오프라인): 입력은 그대로 두고 문구로 알린다', async () => {
    const user = userEvent.setup();
    let mode: 'bad' | 'limit' | 'down' = 'bad';
    mockServer({
      'POST /api/pets/pet-1/todos': () =>
        mode === 'bad'
          ? json(400, { code: 'VALIDATION_ERROR', message: 'x' })
          : mode === 'limit'
            ? json(409, { code: 'TODO_LIMIT_REACHED', message: 'x' })
            : json(503, { code: 'X', message: 'x' }),
    });
    renderTodos('/todos/new');
    await user.type(await screen.findByLabelText(TODO_TEXT.fieldTitle), '검진');
    setDate('2026-11-02');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));
    expect((await screen.findByText(/제목은 40자, 일정 메모는 200자/)).textContent).toContain('병원 메모는 500자');
    expect(screen.getByText(TODO_TEXT.keptInput)).toBeTruthy();
    expect((screen.getByLabelText(TODO_TEXT.fieldTitle) as HTMLInputElement).value).toBe('검진');

    mode = 'limit';
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));
    expect(await screen.findByText(TODO_TEXT.errorLimit)).toBeTruthy();

    mode = 'down';
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveNew }));
    expect(await screen.findByText(/서버에 잠시 문제가 있어요/)).toBeTruthy();
    expect((screen.getByLabelText(TODO_TEXT.fieldDate) as HTMLInputElement).value).toBe('2026-11-02');
  });

  it('입력을 고친 뒤 목록으로 가려 하면 저장하지 않고 나갈지 묻는다', async () => {
    const user = userEvent.setup();
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])) });
    renderTodos('/todos/new');
    await user.type(await screen.findByLabelText(TODO_TEXT.fieldTitle), '검진');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.backToList }));
    const card = await screen.findByRole('alert', { name: TODO_TEXT.leaveTitle });
    expect(card).toBeTruthy();
    await user.click(screen.getByRole('button', { name: TODO_TEXT.leaveStay }));
    expect(screen.queryByText(TODO_TEXT.leaveBody)).toBeNull();
    await user.click(screen.getByRole('button', { name: TODO_TEXT.backToList }));
    await user.click(screen.getByRole('button', { name: TODO_TEXT.leaveGo }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
  });

  it('변경이 없으면 바로 나간다', async () => {
    const user = userEvent.setup();
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])) });
    renderTodos('/todos/new');
    await user.click(await screen.findByRole('button', { name: TODO_TEXT.backToList }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
  });
});

describe('알림 기기 상태 줄', () => {
  it('허용 전(default)이면 사실 + [알림 허용하기] 버튼, 누를 때만 권한을 요청한다', async () => {
    const user = userEvent.setup();
    mockServer({});
    const push = pushValue('default');
    renderTodos('/todos/new', push);
    await screen.findByLabelText(TODO_TEXT.fieldTitle);
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(TODO_TEXT.deviceDefault)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: TODO_TEXT.deviceAllow }));
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(TODO_TEXT.devicePermAsked)).toBeTruthy();
  });

  it('상태별 문구: registered / denied / error(다시 시도) / 알림 끄면 줄이 사라진다', async () => {
    const user = userEvent.setup();
    mockServer({});
    const { unmount } = renderTodos('/todos/new', pushValue('registered'));
    expect(await screen.findByText(TODO_TEXT.deviceRegistered)).toBeTruthy();
    unmount();
    cleanup();

    renderTodos('/todos/new', pushValue('denied'));
    expect(await screen.findByText(TODO_TEXT.deviceDenied)).toBeTruthy();
    cleanup();

    const push = pushValue('error');
    renderTodos('/todos/new', push);
    await user.click(await screen.findByRole('button', { name: TODO_TEXT.deviceRetry }));
    expect(push.recheck).toHaveBeenCalled();

    await user.click(screen.getByRole('switch'));
    expect(screen.queryByText(TODO_TEXT.deviceError)).toBeNull();
  });
});

describe('할 일 보기·고치기', () => {
  function server(extra: Record<string, (b: unknown) => Response> = {}) {
    return mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        json(200, todoListExample(url.searchParams.get('status') === 'done' ? [] : [TODO])),
      ...extra,
    });
  }

  it('저장된 값이 채워지고 병원 메모 칸이 있다. 수정은 전체 본문을 PUT 한다', async () => {
    const user = userEvent.setup();
    const calls = server({ 'PUT /api/todos/t1': (b) => json(200, { ...TODO, ...(b as object) }) });
    renderTodos('/todos/t1');
    expect(((await screen.findByLabelText(TODO_TEXT.fieldTitle)) as HTMLInputElement).value).toBe('광견병 접종');
    expect((screen.getByLabelText(TODO_TEXT.fieldDate) as HTMLInputElement).value).toBe('2026-10-20');
    expect((screen.getByLabelText(TODO_TEXT.fieldTime) as HTMLInputElement).value).toBe('15:00');
    expect((screen.getByLabelText(TODO_TEXT.fieldMemo) as HTMLTextAreaElement).value).toBe('수첩');
    expect(screen.getByText(TODO_TEXT.dateEditNote)).toBeTruthy();

    await user.type(screen.getByLabelText(TODO_TEXT.fieldHospitalNote), '다음 달 재방문');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      title: '광견병 접종',
      dueDate: '2026-10-20',
      dueTime: '15:00',
      memo: '수첩',
      hospitalNote: '다음 달 재방문',
      remind: true,
    });
  });

  it('완료 목록에 있는 할 일도 열린다. 병원 메모를 지우면 null 로 보낸다', async () => {
    const user = userEvent.setup();
    const doneTodo = { ...TODO, completed: true, completedAt: '2026-10-21T00:00:00Z', hospitalNote: '기록' };
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        json(200, todoListExample(url.searchParams.get('status') === 'done' ? [doneTodo] : [])),
      'PUT /api/todos/t1': () => json(200, doneTodo),
    });
    renderTodos('/todos/t1');
    const note = (await screen.findByLabelText(TODO_TEXT.fieldHospitalNote)) as HTMLTextAreaElement;
    expect(note.value).toBe('기록');
    expect(screen.getByRole('button', { name: TODO_TEXT.formCancelDone })).toBeTruthy();
    await user.clear(note);
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect((calls.find((c) => c.method === 'PUT')!.body as { hospitalNote: unknown }).hospitalNote).toBeNull();
  });

  it('병원 메모 501자는 서버에 보내지 않고 오류', async () => {
    const user = userEvent.setup();
    const calls = server();
    renderTodos('/todos/t1');
    const note = await screen.findByLabelText(TODO_TEXT.fieldHospitalNote);
    await user.click(note);
    await user.paste('가'.repeat(501));
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    expect(await screen.findByText('병원 메모는 500자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('없는 id 면 목록으로 돌아가 안내한다', async () => {
    server();
    renderTodos('/todos/zzz');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
    expect((await screen.findByRole('status')).textContent).toContain(TODO_TEXT.gone);
  });

  it('수정 저장 중 404 면 목록으로 보내고 안내한다', async () => {
    const user = userEvent.setup();
    server({ 'PUT /api/todos/t1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    renderTodos('/todos/t1');
    await screen.findByLabelText(TODO_TEXT.fieldTitle);
    await user.type(screen.getByLabelText(TODO_TEXT.fieldMemo), '더');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
    expect((await screen.findByRole('status')).textContent).toContain(TODO_TEXT.gone);
  });

  it('[완료했어요] → 완료 취소로 바뀌고, 고치던 내용은 유지된다', async () => {
    const user = userEvent.setup();
    const calls = server({
      'PUT /api/todos/t1/completion': (b) =>
        json(200, { ...TODO, completed: (b as { completed: boolean }).completed, completedAt: '2026-10-21T00:00:00Z' }),
    });
    renderTodos('/todos/t1');
    await user.type(await screen.findByLabelText(TODO_TEXT.fieldHospitalNote), '적는 중');
    await user.click(screen.getByRole('button', { name: TODO_TEXT.formComplete }));
    expect(await screen.findByRole('button', { name: TODO_TEXT.formCancelDone })).toBeTruthy();
    expect(calls.find((c) => c.path === '/api/todos/t1/completion')!.body).toEqual({ completed: true });
    expect((screen.getByLabelText(TODO_TEXT.fieldHospitalNote) as HTMLTextAreaElement).value).toBe('적는 중');
    expect(screen.getByText(TODO_TEXT.stateDone)).toBeTruthy();
  });

  it('지우기: 확인 카드에서 한 번 더 확인한 뒤 DELETE, 목록으로. [그대로 두기]는 호출 없음', async () => {
    const user = userEvent.setup();
    const calls = server({ 'DELETE /api/todos/t1': () => json(204, null) });
    renderTodos('/todos/t1');
    await user.click(await screen.findByRole('button', { name: TODO_TEXT.deleteButton }));
    expect(screen.getByText(TODO_TEXT.deleteTitle)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: TODO_TEXT.deleteNo }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: TODO_TEXT.deleteButton }));
    await user.click(screen.getByRole('button', { name: TODO_TEXT.deleteYes }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/todos'));
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    expect((await screen.findByRole('status')).textContent).toContain(TODO_TEXT.deleted);
  });

  it('지우기 실패(서버 오류)면 카드를 닫고 오류를 알린다', async () => {
    const user = userEvent.setup();
    server({ 'DELETE /api/todos/t1': () => json(500, { code: 'X', message: 'x' }) });
    renderTodos('/todos/t1');
    await user.click(await screen.findByRole('button', { name: TODO_TEXT.deleteButton }));
    await user.click(screen.getByRole('button', { name: TODO_TEXT.deleteYes }));
    expect(await screen.findByText(/서버에 잠시 문제가 있어요/)).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/todos/t1');
  });
});
