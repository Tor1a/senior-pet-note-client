import { act, fireEvent, screen } from '@testing-library/react-native';
import { todoExample, todoListExample } from '../lib/todoFixtures';
import { TODO_TEXT } from '../lib/todoText';
import { setFontScale } from '../testing/fontScale';
import { pickInSheet } from '../testing/mockDateTimePicker';
import { mockRouter, resetRouterMocks, systemBack } from '../testing/mockRouter';
import TodoFormScreen from './TodoFormScreen';
import { json, mockServer, pushValue, renderWith } from './todoTestKit';

// 할 일 추가·보기·고치기 화면: 계약 예시 JSON, fetch 가짜 (웹 TodoFormPage.test 와 같은 시나리오).

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('@react-native-community/datetimepicker', () => require('../testing/mockDateTimePicker'));

const TODO = todoExample({ id: 't1', title: '광견병 접종', dueDate: '2026-10-20', dueTime: '15:00', memo: '수첩', hospitalNote: null });

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
});

const titleInput = () => screen.getByLabelText(TODO_TEXT.fieldTitle);
const saveNew = () => screen.getByRole('button', { name: TODO_TEXT.saveNew });
const lastDismiss = () => mockRouter.dismissTo.mock.calls.at(-1)?.[0];

async function pickDate(date: Date) {
  await fireEvent.press(screen.getByTestId('todo-date'));
  await pickInSheet(date);
}

describe('할 일 추가', () => {
  it('처음에는 날짜·시각이 비어 있고 알림이 켜져 있다. 제목 예시·추천 버튼이 없다', async () => {
    mockServer({});
    await renderWith(<TodoFormScreen />);
    expect(titleInput().props.placeholder).toBeUndefined();
    expect(screen.getByText('날짜 고르기')).toBeTruthy();
    expect(screen.getByText('시각 정하지 않음')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: TODO_TEXT.fieldRemind }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('하루 전 오후 8:00, 당일 오전 9:00에 알려 드려요.')).toBeTruthy();
    expect(screen.getByText(/추천하지 않아요/)).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    // 새로 만들 때는 병원 메모 칸이 없다(방문 뒤 수정 화면에서 적는다)
    expect(screen.queryByLabelText(TODO_TEXT.fieldHospitalNote)).toBeNull();
    expect(screen.queryByRole('button', { name: /^(접종|구충|검진)$/ })).toBeNull();
  });

  it('검증: 제목 비움·날짜 미선택 오류, 41자 오류, 서버 호출 없음', async () => {
    const calls = mockServer({});
    await renderWith(<TodoFormScreen />);
    await fireEvent.press(saveNew());
    expect(await screen.findByText(TODO_TEXT.summaryProblem)).toBeTruthy();
    expect(screen.getByText('! 제목을 적어 주세요.')).toBeTruthy();

    await fireEvent.changeText(titleInput(), '접종');
    expect(screen.queryByText('! 제목을 적어 주세요.')).toBeNull(); // 입력을 시작하면 오류가 사라진다
    await fireEvent.press(saveNew());
    expect(await screen.findByText('! 날짜를 골라 주세요.')).toBeTruthy();

    await fireEvent.changeText(titleInput(), '가'.repeat(41));
    await pickDate(new Date(2026, 9, 20, 12));
    await fireEvent.press(saveNew());
    expect(await screen.findByText('! 제목은 40자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('등록: 본문(빈 값 null)을 보내고 목록으로 가며 안내 코드를 싣는다', async () => {
    const calls = mockServer({ 'POST /api/pets/pet-1/todos': (body) => json(201, { ...TODO, ...(body as object) }) });
    await renderWith(<TodoFormScreen />);
    await fireEvent.changeText(titleInput(), '  광견병 접종 ');
    await pickDate(new Date(2026, 9, 20, 12));
    expect(screen.getByText('2026년 10월 20일 (화)')).toBeTruthy();
    await fireEvent.press(saveNew());

    await act(async () => {});
    expect(lastDismiss()).toEqual({ pathname: '/todos', params: { notice: 'created' } });
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      title: '광견병 접종',
      dueDate: '2026-10-20',
      dueTime: null,
      memo: null,
      hospitalNote: null,
      remind: true,
    });
  });

  it('시각·메모·알림 끔을 담아 보낸다. 시각 지우기도 된다', async () => {
    const calls = mockServer({ 'POST /api/pets/pet-1/todos': () => json(201, TODO) });
    await renderWith(<TodoFormScreen />);
    await fireEvent.changeText(titleInput(), '검진');
    await pickDate(new Date(2026, 10, 2, 12));
    await fireEvent.press(screen.getByTestId('todo-time'));
    await pickInSheet(new Date(2026, 10, 2, 9, 30));
    expect(screen.getByText('오전 9:30')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.fieldTimeClear }));
    expect(screen.getByText('시각 정하지 않음')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('todo-time'));
    await pickInSheet(new Date(2026, 10, 2, 9, 30));
    await fireEvent.changeText(screen.getByLabelText(TODO_TEXT.fieldMemo), '병원 이름');
    await fireEvent.press(screen.getByRole('checkbox', { name: TODO_TEXT.fieldRemind }));
    expect(screen.getByText(TODO_TEXT.remindOffInfo)).toBeTruthy();
    await fireEvent.press(saveNew());
    await act(async () => {});
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
    let release!: () => void;
    const calls = mockServer({
      'POST /api/pets/pet-1/todos': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(201, TODO));
        }),
    });
    await renderWith(<TodoFormScreen />);
    await fireEvent.changeText(titleInput(), '검진');
    await pickDate(new Date(2026, 10, 2, 12));
    await fireEvent.press(saveNew());
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.saving }));
    expect(screen.getByRole('button', { name: TODO_TEXT.saving }).props.accessibilityState.disabled).toBe(true);
    // 저장 중에는 뒤로가기도 확인 카드 없이 막힌다
    expect(systemBack()).toBe(true);
    expect(screen.queryByText(TODO_TEXT.leaveTitle)).toBeNull();
    await act(async () => release());
    expect(lastDismiss()).toEqual({ pathname: '/todos', params: { notice: 'created' } });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('서버 오류(400·한도 409·5xx): 입력은 그대로 두고 문구로 알린다', async () => {
    let mode: 'bad' | 'limit' | 'down' = 'bad';
    mockServer({
      'POST /api/pets/pet-1/todos': () =>
        mode === 'bad'
          ? json(400, { code: 'VALIDATION_ERROR', message: 'x' })
          : mode === 'limit'
            ? json(409, { code: 'TODO_LIMIT_REACHED', message: 'x' })
            : json(503, { code: 'X', message: 'x' }),
    });
    await renderWith(<TodoFormScreen />);
    await fireEvent.changeText(titleInput(), '검진');
    await pickDate(new Date(2026, 10, 2, 12));
    await fireEvent.press(saveNew());
    expect(await screen.findByText(/제목은 40자, 일정 메모는 200자.*병원 메모는 500자/)).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.keptInput)).toBeTruthy();
    expect(titleInput().props.value).toBe('검진');

    mode = 'limit';
    await fireEvent.press(saveNew());
    expect(await screen.findByText(TODO_TEXT.errorLimit)).toBeTruthy();

    mode = 'down';
    await fireEvent.press(saveNew());
    expect(await screen.findByText(/서버에 잠시 문제가 있어요/)).toBeTruthy();
    expect(screen.getByText('2026년 11월 2일 (월)')).toBeTruthy();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('입력을 고친 뒤 뒤로(버튼·시스템)가면 저장하지 않고 나갈지 묻는다', async () => {
    mockServer({});
    await renderWith(<TodoFormScreen />);
    await fireEvent.changeText(titleInput(), '검진');
    await fireEvent.press(screen.getByRole('button', { name: '할 일 목록으로 돌아가기' }));
    expect(await screen.findByText(TODO_TEXT.leaveTitle)).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.leaveBody)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.leaveStay }));
    expect(screen.queryByText(TODO_TEXT.leaveTitle)).toBeNull();

    // 시스템 뒤로·스와이프
    expect(systemBack()).toBe(true);
    expect(await screen.findByText(TODO_TEXT.leaveTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.leaveGo }));
    expect(mockNavigationDispatched()).toBe(true);
  });

  it('변경이 없으면 바로 나간다', async () => {
    mockServer({});
    await renderWith(<TodoFormScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '할 일 목록으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(systemBack()).toBe(false);
  });
});

function mockNavigationDispatched() {
  const { mockNavigation } = require('../testing/mockRouter');
  return mockNavigation.dispatch.mock.calls.length > 0;
}

describe('알림 기기 상태 줄', () => {
  it('허용 전(default)이면 사실 + [알림 허용하기] 버튼, 누를 때만 권한을 요청한다', async () => {
    mockServer({});
    const push = pushValue('default');
    await renderWith(<TodoFormScreen />, push);
    expect(push.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(TODO_TEXT.deviceDefault)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.deviceAllow }));
    expect(push.requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(`✓ ${TODO_TEXT.devicePermAsked}`)).toBeTruthy();
  });

  it('registered 면 사실만 보이고 버튼이 없다', async () => {
    mockServer({});
    await renderWith(<TodoFormScreen />, pushValue('registered'));
    expect(screen.getByText(TODO_TEXT.deviceRegistered)).toBeTruthy();
    expect(screen.queryByRole('button', { name: TODO_TEXT.deviceAllow })).toBeNull();
  });

  it('denied 면 사실 + [설정 열기]', async () => {
    mockServer({});
    await renderWith(<TodoFormScreen />, pushValue('denied'));
    expect(screen.getByText(TODO_TEXT.deviceDenied)).toBeTruthy();
    expect(screen.getByRole('button', { name: '설정 열기' })).toBeTruthy();
  });

  it('unavailable(개발 빌드가 아닌 환경)이면 저장은 할 수 있다는 안내', async () => {
    mockServer({});
    await renderWith(<TodoFormScreen />, pushValue('unavailable'));
    expect(screen.getByText(TODO_TEXT.deviceUnavailable)).toBeTruthy();
  });

  it('error 면 [다시 시도], 알림을 끄면 줄이 사라진다', async () => {
    mockServer({});
    const push = pushValue('error');
    await renderWith(<TodoFormScreen />, push);
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.deviceRetry }));
    expect(push.recheck).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: TODO_TEXT.fieldRemind }));
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
    const calls = server({ 'PUT /api/todos/t1': (b) => json(200, { ...TODO, ...(b as object) }) });
    await renderWith(<TodoFormScreen todoId="t1" />);
    await screen.findByDisplayValue('광견병 접종');
    expect(screen.getByText('2026년 10월 20일 (화)')).toBeTruthy();
    expect(screen.getByText('오후 3:00')).toBeTruthy();
    expect(screen.getByDisplayValue('수첩')).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.dateEditNote)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(TODO_TEXT.fieldHospitalNote), '다음 달 재방문');
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    await act(async () => {});
    expect(lastDismiss()).toEqual({ pathname: '/todos', params: { notice: 'updated' } });
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
    const doneTodo = { ...TODO, completed: true, completedAt: '2026-10-21T00:00:00Z', hospitalNote: '기록' };
    const calls = mockServer({
      'GET /api/pets/pet-1/todos': (_b, url) =>
        json(200, todoListExample(url.searchParams.get('status') === 'done' ? [doneTodo] : [])),
      'PUT /api/todos/t1': () => json(200, doneTodo),
    });
    await renderWith(<TodoFormScreen todoId="t1" />);
    await screen.findByDisplayValue('기록');
    expect(screen.getByRole('button', { name: TODO_TEXT.formCancelDone })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(TODO_TEXT.fieldHospitalNote), '');
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    await act(async () => {});
    expect((calls.find((c) => c.method === 'PUT')!.body as { hospitalNote: unknown }).hospitalNote).toBeNull();
  });

  it('병원 메모 501자는 서버에 보내지 않고 오류', async () => {
    const calls = server();
    await renderWith(<TodoFormScreen todoId="t1" />);
    await screen.findByDisplayValue('광견병 접종');
    await fireEvent.changeText(screen.getByLabelText(TODO_TEXT.fieldHospitalNote), '가'.repeat(501));
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    expect(await screen.findByText('! 병원 메모는 500자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('없는 id 면 목록으로 돌아가 안내 코드(gone)를 싣는다', async () => {
    server();
    await renderWith(<TodoFormScreen todoId="zzz" />);
    await act(async () => {});
    expect(lastDismiss()).toEqual({ pathname: '/todos', params: { notice: 'gone' } });
  });

  it('수정 저장 중 404 면 목록으로 보내고 안내한다', async () => {
    server({ 'PUT /api/todos/t1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderWith(<TodoFormScreen todoId="t1" />);
    await screen.findByDisplayValue('광견병 접종');
    await fireEvent.changeText(screen.getByLabelText(TODO_TEXT.fieldMemo), '더');
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.saveEdit }));
    await act(async () => {});
    expect(lastDismiss()).toEqual({ pathname: '/todos', params: { notice: 'gone' } });
  });

  it('[완료했어요] → 완료 취소로 바뀌고, 고치던 내용은 유지된다', async () => {
    const calls = server({
      'PUT /api/todos/t1/completion': (b) =>
        json(200, { ...TODO, completed: (b as { completed: boolean }).completed, completedAt: '2026-10-21T00:00:00Z' }),
    });
    await renderWith(<TodoFormScreen todoId="t1" />);
    await screen.findByDisplayValue('광견병 접종');
    await fireEvent.changeText(screen.getByLabelText(TODO_TEXT.fieldHospitalNote), '적는 중');
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.formComplete }));
    expect(await screen.findByRole('button', { name: TODO_TEXT.formCancelDone })).toBeTruthy();
    expect(calls.find((c) => c.path === '/api/todos/t1/completion')!.body).toEqual({ completed: true });
    expect(screen.getByDisplayValue('적는 중')).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.stateDone)).toBeTruthy();
  });

  it('지우기: 확인 카드에서 한 번 더 확인한 뒤 DELETE, 목록으로. [그대로 두기]는 호출 없음', async () => {
    const calls = server({ 'DELETE /api/todos/t1': () => json(204, null) });
    await renderWith(<TodoFormScreen todoId="t1" />);
    await fireEvent.press(await screen.findByRole('button', { name: TODO_TEXT.deleteButton }));
    expect(screen.getByText(TODO_TEXT.deleteTitle)).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.deleteBody)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.deleteNo }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.deleteButton }));
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.deleteYes }));
    await act(async () => {});
    expect(lastDismiss()).toEqual({ pathname: '/todos', params: { notice: 'deleted' } });
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('지우기 실패(서버 오류)면 카드를 닫고 오류를 알린다', async () => {
    server({ 'DELETE /api/todos/t1': () => json(500, { code: 'X', message: 'x' }) });
    await renderWith(<TodoFormScreen todoId="t1" />);
    await fireEvent.press(await screen.findByRole('button', { name: TODO_TEXT.deleteButton }));
    await fireEvent.press(screen.getByRole('button', { name: TODO_TEXT.deleteYes }));
    expect(await screen.findByText(/서버에 잠시 문제가 있어요/)).toBeTruthy();
    expect(screen.queryByText(TODO_TEXT.deleteTitle)).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});

describe('큰 글씨', () => {
  it('글자 2배에서는 스크롤 맨 아래에도 저장 버튼이 한 번 더 있다', async () => {
    setFontScale(2);
    mockServer({});
    await renderWith(<TodoFormScreen />);
    expect(screen.getAllByRole('button', { name: TODO_TEXT.saveNew })).toHaveLength(2);
  });
});
