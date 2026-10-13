// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { todoExample, todoListExample } from '../lib/todoFixtures';
import { findTodoForbidden, TODO_TEXT } from '../lib/todoText';
import { setToken } from '../lib/tokenStorage';
import { json, mockServer, renderTodos } from './todoTestKit';

// 할 일 목록 화면: 계약 예시 JSON 으로 fetch 를 가짜로 바꿔 검사한다 (기획서 W4).

const PAST = todoExample({ id: 't-past', title: '구충제', dueDate: '2026-10-10', dueTime: null, memo: null, dateStatus: 'past' });
const TODAY = todoExample({ id: 't-today', title: '정기 검진', dueDate: '2026-10-13', dueTime: '14:30', dateStatus: 'today' });
const TOMORROW = todoExample({ id: 't-tomorrow', title: '피검사', dueDate: '2026-10-14', dateStatus: 'tomorrow', remind: false });
const FUTURE = todoExample({ id: 't-future', title: '광견병 접종', dueDate: '2026-10-20', dateStatus: 'future' });
const DONE = todoExample({
  id: 't-done',
  title: '심장사상충 약',
  dueDate: '2026-09-01',
  completed: true,
  completedAt: '2026-09-01T03:00:00Z',
  hospitalNote: '다음 방문 때 수첩 가져가기',
  dateStatus: 'past',
});

beforeEach(() => {
  setToken('test-token');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('할 일 목록 — 예정', () => {
  it('서버 dateStatus 로 묶어 보여 주고, 안내문·면책·탭이 있다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([PAST, TODAY, TOMORROW, FUTURE])),
    });
    renderTodos('/todos');

    expect(await screen.findByText('광견병 접종')).toBeTruthy();
    expect(calls[0].search).toBe('?status=open');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['지난 일정', '오늘', '내일', '그 이후']);
    // 날짜·시각은 서버 문자열을 형식만 바꿔 보여 준다
    expect(screen.getByText('10월 13일 (화) · 오후 2:30')).toBeTruthy();
    expect(screen.getByText('10월 10일 (토)')).toBeTruthy();
    expect(screen.getByText('알림 안 받기로 해 둠')).toBeTruthy();
    expect(screen.getByText(/추천하지 않아요/)).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /예정/ }).getAttribute('aria-selected')).toBe('true');
    // 지난 일정에 독촉 표현이 없다
    expect(findTodoForbidden(document.body.textContent?.replace(/구충제|정기 검진|피검사|광견병 접종|수첩 챙기기/g, '') ?? '')).toBeNull();
  });

  it('빈 목록: 안내와 [할 일 추가] 링크, 추천 예시가 없다', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])) });
    renderTodos('/todos');
    expect(await screen.findByText(TODO_TEXT.emptyOpenTitle)).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.emptyOpenBody)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: TODO_TEXT.add }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/접종하|구충하|검진하/);
  });

  it('완료 체크: 줄이 제자리에서 접히고 [되돌리기]로 원래 줄이 돌아온다', async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])),
      'PUT /api/todos/t-today/completion': (body) =>
        json(200, { ...TODAY, completed: (body as { completed: boolean }).completed, completedAt: (body as { completed: boolean }).completed ? '2026-10-13T01:00:00Z' : null }),
    });
    renderTodos('/todos');
    await user.click(await screen.findByRole('button', { name: '완료했어요, 정기 검진' }));

    expect(await screen.findByRole('button', { name: '정기 검진 완료 체크 되돌리기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '완료했어요, 정기 검진' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(TODO_TEXT.completedNotice);
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ completed: true });

    await user.click(screen.getByRole('button', { name: '정기 검진 완료 체크 되돌리기' }));
    expect(await screen.findByRole('button', { name: '완료했어요, 정기 검진' })).toBeTruthy();
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ completed: true }, { completed: false }]);
    expect(screen.getByRole('status').textContent).toContain(TODO_TEXT.undoneNotice);
  });

  it('완료 체크 요청이 오래 걸리는 동안 버튼은 비활성이고 요청은 한 번만 간다', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])),
      'PUT /api/todos/t-today/completion': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(200, { ...TODAY, completed: true }));
        }),
    });
    renderTodos('/todos');
    const button = await screen.findByRole('button', { name: '완료했어요, 정기 검진' });
    await user.click(button);
    await user.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe(TODO_TEXT.completing);
    release();
    await screen.findByRole('button', { name: '정기 검진 완료 체크 되돌리기' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('완료 체크 실패: 줄은 그대로고 이유와 다시 누르라는 안내가 나온다 (오프라인 포함)', async () => {
    const user = userEvent.setup();
    mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])),
      'PUT /api/todos/t-today/completion': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    renderTodos('/todos');
    await user.click(await screen.findByRole('button', { name: '완료했어요, 정기 검진' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('완료로 체크하지 못했어요.');
    expect(alert.textContent).toContain('서버에 잠시 문제가 있어요');
    expect(alert.textContent).toContain('한 번 더 눌러 주세요');
    expect(screen.getByRole('button', { name: '완료했어요, 정기 검진' })).toBeTruthy();
  });

  it('완료 체크 중 404(이미 지워짐): 안내하고 목록을 다시 불러온다', async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    mockServer({
      'GET /api/pets/pet-1/todos': () => {
        listCalls += 1;
        return json(200, todoListExample(listCalls === 1 ? [TODAY] : []));
      },
      'PUT /api/todos/t-today/completion': () => json(404, { code: 'NOT_FOUND', message: 'x' }),
    });
    renderTodos('/todos');
    await user.click(await screen.findByRole('button', { name: '완료했어요, 정기 검진' }));
    await screen.findByText(TODO_TEXT.emptyOpenTitle);
    expect(screen.getByRole('status').textContent).toContain(TODO_TEXT.gone);
  });

  it('불러오기 실패(오프라인): 안내와 [다시 불러오기], 누르면 다시 불러온다', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockServer({
      'GET /api/pets/pet-1/todos': () => (fail ? json(500, { code: 'X', message: 'x' }) : json(200, todoListExample([FUTURE]))),
    });
    renderTodos('/todos');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('서버에 잠시 문제가 있어요');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: TODO_TEXT.retry }));
    expect(await screen.findByText('광견병 접종')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('알림으로 열면(?source=push) 그 사실을 한 줄로 알린다', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([FUTURE])) });
    renderTodos('/todos?source=push');
    await screen.findByText('광견병 접종');
    expect(screen.getByRole('status').textContent).toContain(TODO_TEXT.openedFromPush);
  });

  it('3개 이상이면 위쪽에도 [할 일 추가]가 있다', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([PAST, TODAY, FUTURE])) });
    renderTodos('/todos');
    await screen.findByText('광견병 접종');
    expect(screen.getAllByRole('link', { name: TODO_TEXT.add })).toHaveLength(2);
  });
});

describe('할 일 목록 — 완료 탭', () => {
  it('완료 탭은 status=done 으로 불러오고 병원 메모를 보여 주며 [완료 취소]가 있다', async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        url.searchParams.get('status') === 'done' ? json(200, todoListExample([DONE])) : json(200, todoListExample([FUTURE])),
      'PUT /api/todos/t-done/completion': () => json(200, { ...DONE, completed: false, completedAt: null }),
    });
    renderTodos('/todos');
    await screen.findByText('광견병 접종');
    await user.click(screen.getByRole('tab', { name: /완료/ }));

    expect(await screen.findByText(/심장사상충 약/)).toBeTruthy();
    expect(screen.getByText(/다음 방문 때 수첩 가져가기/)).toBeTruthy();
    expect(calls.some((c) => c.search === '?status=done')).toBe(true);

    await user.click(screen.getByRole('button', { name: '심장사상충 약 완료 취소' }));
    await screen.findByText(TODO_TEXT.emptyDone);
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ completed: false });
    expect(screen.getByRole('status').textContent).toContain(TODO_TEXT.cancelDoneNotice);
    // 예정 탭으로 돌아가면 새로 불러온다
    await user.click(screen.getByRole('tab', { name: /예정/ }));
    await waitFor(() => expect(calls.filter((c) => c.search === '?status=open').length).toBe(2));
  });

  it('완료한 할 일이 없으면 안내', async () => {
    const user = userEvent.setup();
    mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        json(200, todoListExample(url.searchParams.get('status') === 'done' ? [] : [FUTURE])),
    });
    renderTodos('/todos');
    await screen.findByText('광견병 접종');
    await user.click(screen.getByRole('tab', { name: /완료/ }));
    expect(await screen.findByText(TODO_TEXT.emptyDone)).toBeTruthy();
  });
});
