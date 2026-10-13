import { fireEvent, screen } from '@testing-library/react-native';
import { todoExample, todoListExample } from '../lib/todoFixtures';
import { findTodoForbidden, TODO_TEXT } from '../lib/todoText';
import { setFontScale } from '../testing/fontScale';
import { mockRouter, resetRouterMocks, state } from '../testing/mockRouter';
import TodosScreen from './TodosScreen';
import { json, mockServer, renderWith } from './todoTestKit';

// 할 일 목록 화면: 계약 예시 JSON 으로 fetch 를 가짜로 바꿔 검사한다 (웹 TodosPage.test 와 같은 시나리오).

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

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
  resetRouterMocks();
  setFontScale(1);
});

describe('할 일 목록 — 예정', () => {
  it('서버 dateStatus 로 묶어 보여 주고, 안내문·면책·탭이 있다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([PAST, TODAY, TOMORROW, FUTURE])),
    });
    await renderWith(<TodosScreen />);

    expect(await screen.findByText('광견병 접종')).toBeTruthy();
    expect(calls[0].search).toBe('?status=open');
    for (const name of ['지난 일정', '오늘', '내일', '그 이후']) expect(screen.getByRole('header', { name })).toBeTruthy();
    expect(screen.getByText('10월 13일 (화) · 오후 2:30')).toBeTruthy();
    expect(screen.getByText('10월 10일 (토)')).toBeTruthy();
    expect(screen.getByText('알림 꺼짐')).toBeTruthy();
    expect(screen.getByText(/추천하지 않아요/)).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '예정' }).props.accessibilityState.checked).toBe(true);
  });

  it('빈 목록: 안내와 [할 일 추가], 추천 예시가 없다', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])) });
    await renderWith(<TodosScreen />);
    expect(await screen.findByText(TODO_TEXT.emptyOpenTitle)).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.emptyOpenBody)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.add }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/todos/new');
  });

  it('[보기·고치기]는 그 할 일의 폼으로 간다. 오늘로 돌아가기는 뒤로', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])) });
    await renderWith(<TodosScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: '정기 검진 보기·고치기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/todos/t-today');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('완료 체크: 줄이 제자리에서 접히고 [되돌리기]로 원래 줄이 돌아온다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])),
      'PUT /api/todos/t-today/completion': (body) => {
        const completed = (body as { completed: boolean }).completed;
        return json(200, { ...TODAY, completed, completedAt: completed ? '2026-10-13T01:00:00Z' : null });
      },
    });
    await renderWith(<TodosScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: '정기 검진 완료로 체크' }));

    expect(await screen.findByRole('button', { name: '정기 검진 완료 체크 되돌리기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '정기 검진 완료로 체크' })).toBeNull();
    expect(screen.getByText(`✓ ${TODO_TEXT.completedNotice}`)).toBeTruthy();
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ completed: true });

    await fireEvent.press(screen.getByRole('button', { name: '정기 검진 완료 체크 되돌리기' }));
    expect(await screen.findByRole('button', { name: '정기 검진 완료로 체크' })).toBeTruthy();
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ completed: true }, { completed: false }]);
    expect(screen.getByText(`✓ ${TODO_TEXT.undoneNotice}`)).toBeTruthy();
  });

  it('완료 체크 요청 중에는 버튼이 비활성이고 요청은 한 번만 간다', async () => {
    let release!: () => void;
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])),
      'PUT /api/todos/t-today/completion': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(200, { ...TODAY, completed: true }));
        }),
    });
    await renderWith(<TodosScreen />);
    const button = await screen.findByRole('button', { name: '정기 검진 완료로 체크' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(screen.getByRole('button', { name: '정기 검진 완료로 체크' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(TODO_TEXT.completing)).toBeTruthy();
    release();
    await screen.findByRole('button', { name: '정기 검진 완료 체크 되돌리기' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('완료 체크 실패: 줄은 그대로고 이유와 다시 누르라는 안내가 나온다', async () => {
    mockServer({
      'GET /api/pets/pet-1/todos': () => json(200, todoListExample([TODAY])),
      'PUT /api/todos/t-today/completion': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    await renderWith(<TodosScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: '정기 검진 완료로 체크' }));
    const alert = await screen.findByRole('alert');
    const text = JSON.stringify(alert.props.children);
    expect(text).toContain('완료로 체크하지 못했어요.');
    expect(text).toContain('서버에 잠시 문제가 있어요');
    expect(text).toContain('한 번 더 눌러 주세요');
    expect(screen.getByRole('button', { name: '정기 검진 완료로 체크' })).toBeTruthy();
  });

  it('완료 체크 중 404(이미 지워짐): 안내하고 목록을 다시 불러온다', async () => {
    let listCalls = 0;
    mockServer({
      'GET /api/pets/pet-1/todos': () => {
        listCalls += 1;
        return json(200, todoListExample(listCalls === 1 ? [TODAY] : []));
      },
      'PUT /api/todos/t-today/completion': () => json(404, { code: 'NOT_FOUND', message: 'x' }),
    });
    await renderWith(<TodosScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: '정기 검진 완료로 체크' }));
    await screen.findByText(TODO_TEXT.emptyOpenTitle);
    expect(screen.getByText(`✓ ${TODO_TEXT.gone}`)).toBeTruthy();
  });

  it('불러오기 실패: 안내와 [다시 불러오기], 누르면 다시 불러온다', async () => {
    let fail = true;
    mockServer({
      'GET /api/pets/pet-1/todos': () => (fail ? json(500, { code: 'X', message: 'x' }) : json(200, todoListExample([FUTURE]))),
    });
    await renderWith(<TodosScreen />);
    await screen.findByText(/서버에 잠시 문제가 있어요/);
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.retry }));
    expect(await screen.findByText('광견병 접종')).toBeTruthy();
    expect(screen.queryByText(/서버에 잠시 문제가 있어요/)).toBeNull();
  });

  it('알림으로 열면(source=push) 그 사실을 한 줄로 알리고 파라미터를 비운다', async () => {
    state.params = { source: 'push' };
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([FUTURE])) });
    await renderWith(<TodosScreen />);
    await screen.findByText('광견병 접종');
    expect(screen.getByText(`✓ ${TODO_TEXT.openedFromPush}`)).toBeTruthy();
    expect(mockRouter.setParams).toHaveBeenCalledWith({ source: undefined });
  });

  it('폼에서 돌아오며 실은 안내 코드(created)를 문구로 바꿔 보여 준다', async () => {
    state.params = { notice: 'created' };
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([FUTURE])) });
    await renderWith(<TodosScreen />);
    await screen.findByText('광견병 접종');
    expect(screen.getByText(`✓ ${TODO_TEXT.created}`)).toBeTruthy();
  });

  it('3개 이상이면 위쪽에도 [할 일 추가]가 있다', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([PAST, TODAY, FUTURE])) });
    await renderWith(<TodosScreen />);
    await screen.findByText('광견병 접종');
    expect(screen.getAllByRole('button', { name: TODO_TEXT.add })).toHaveLength(2);
  });

  it('지난 일정에 독촉·경고 표현이 없다(서비스가 쓴 글)', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([PAST])) });
    await renderWith(<TodosScreen />);
    await screen.findByText('구충제');
    const texts = screen.getAllByText(/./).map((n) => String(n.props.children));
    const own = texts.filter((t) => !/구충제/.test(t));
    for (const t of own) expect(findTodoForbidden(t)).toBeNull();
  });
});

describe('할 일 목록 — 완료 탭', () => {
  it('완료 탭은 status=done 으로 불러오고 병원 메모를 보여 주며 [완료 취소]가 있다', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        url.searchParams.get('status') === 'done' ? json(200, todoListExample([DONE])) : json(200, todoListExample([FUTURE])),
      'PUT /api/todos/t-done/completion': () => json(200, { ...DONE, completed: false, completedAt: null }),
    });
    await renderWith(<TodosScreen />);
    await screen.findByText('광견병 접종');
    await fireEvent.press(screen.getByRole('radio', { name: '완료' }));

    expect(await screen.findByText(/심장사상충 약/)).toBeTruthy();
    expect(screen.getByText(/다음 방문 때 수첩 가져가기/)).toBeTruthy();
    expect(calls.some((c) => c.search === '?status=done')).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: '심장사상충 약 완료 취소' }));
    await screen.findByText(TODO_TEXT.emptyDone);
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ completed: false });
    expect(screen.getByText(`✓ ${TODO_TEXT.cancelDoneNotice}`)).toBeTruthy();
    // 예정 탭으로 돌아가면 새로 불러온다
    await fireEvent.press(screen.getByRole('radio', { name: '예정' }));
    await screen.findByText('광견병 접종');
    expect(calls.filter((c) => c.search === '?status=open').length).toBe(2);
  });

  it('완료한 할 일이 없으면 안내', async () => {
    mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        json(200, todoListExample(url.searchParams.get('status') === 'done' ? [] : [FUTURE])),
    });
    await renderWith(<TodosScreen />);
    await screen.findByText('광견병 접종');
    await fireEvent.press(screen.getByRole('radio', { name: '완료' }));
    expect(await screen.findByText(TODO_TEXT.emptyDone)).toBeTruthy();
  });
});
