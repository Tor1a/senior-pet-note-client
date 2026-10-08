import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { pressTwiceInOneFrame } from '../testing/doublePress';
import { setFontScale } from '../testing/fontScale';
import { json, MED, PET } from '../testing/fixtures';
import { pickInSheet } from '../testing/mockDateTimePicker';
import { mockRouter, resetRouterMocks, state } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import MedicationFormScreen from './MedicationFormScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('@react-native-community/datetimepicker', () => require('../testing/mockDateTimePicker'));

const reloadPet = jest.fn();
let calls: { url: string; method: string; body: unknown }[] = [];

function setup(routes: Record<string, () => Response> = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: path, method, body });
    const handler = routes[`${method} ${path}`];
    if (handler) return handler();
    if (method === 'GET' && path === '/api/pets/pet-1/medications') return json(200, [MED]);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

async function renderForm(id?: string) {
  await render(
    <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
      <MedicationFormScreen id={id} />
    </PetContext.Provider>,
  );
}

const saved = (method: string) => calls.find((c) => c.method === method);

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
});

describe('약 등록 폼', () => {
  it('이름·용량 trim, 용량 공백이면 null, 시각 오름차순으로 POST 하고 목록으로 돌아가 created 안내 코드를 싣는다', async () => {
    setup({ 'POST /api/pets/pet-1/medications': () => json(201, { ...MED, id: 'med-9', name: '레나메진', times: ['20:00', '21:00'] }) });
    await renderForm();
    expect(screen.getByText('약 추가')).toBeTruthy();
    expect(screen.queryByText('시각을 바꾸면 알림 시각도 같이 바뀌어요.')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('약 이름'), '  레나메진 ');
    await fireEvent.changeText(screen.getByLabelText('용량 (선택)'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: '+ 시각 추가' }));
    expect(screen.getByRole('button', { name: '2번째 시각, 오후 8시' })).toBeTruthy();
    // 1번째 시각을 21:00 으로
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    await pickInSheet(new Date(2026, 9, 8, 21, 0));
    expect(screen.getByRole('button', { name: '1번째 시각, 오후 9시' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));

    await screen.findByText('약 추가');
    expect(saved('POST')?.body).toEqual({ name: '레나메진', doseText: null, times: ['20:00', '21:00'] });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'created', medId: 'med-9' } });
  });

  it('선택기 시트에서 [취소]하면 이전 시각을 유지한다', async () => {
    setup();
    await renderForm();
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    await fireEvent(screen.getByTestId('datetimepicker'), 'valueChange', { type: 'set' }, new Date(2026, 9, 8, 22, 0));
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '1번째 시각, 오전 8시' })).toBeTruthy();
  });

  it('검증 문구: 이름 없음·같은 시각·시각 미선택이면 요청을 보내지 않는다', async () => {
    setup();
    await renderForm();
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    expect((await screen.findAllByText(/약 이름을 적어 주세요\./)).length).toBeGreaterThan(0);
    expect(screen.getByText('! 약 이름을 적어 주세요.')).toBeTruthy(); // 이름 칸 아래 글자 오류

    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.press(screen.getByRole('button', { name: '+ 시각 추가' }));
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    await pickInSheet(new Date(2026, 9, 8, 20, 0));
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await screen.findByText('같은 시각이 두 번 들어갔어요. 서로 다른 시각으로 골라 주세요.');
    expect(saved('POST')).toBeUndefined();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('시각은 최대 3개까지 추가되고, 1개일 때는 [이 시각 빼기]가 없다', async () => {
    setup();
    await renderForm();
    expect(screen.queryByRole('button', { name: '1번째 시각 빼기' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '+ 시각 추가' }));
    await fireEvent.press(screen.getByRole('button', { name: '+ 시각 추가' }));
    expect(screen.getByRole('button', { name: '3번째 시각, 오후 8시' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ 시각 추가' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '3번째 시각 빼기' }));
    expect(screen.queryByRole('button', { name: '3번째 시각, 오후 8시' })).toBeNull();
    expect(screen.getByRole('button', { name: '+ 시각 추가' })).toBeTruthy();
  });

  it('이름·용량은 50자 제한, 서버 400 이면 안내하고 입력값은 그대로다', async () => {
    setup({ 'POST /api/pets/pet-1/medications': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    await renderForm();
    expect(screen.getByLabelText('약 이름').props.maxLength).toBe(50);
    expect(screen.getByLabelText('용량 (선택)').props.maxLength).toBe(50);
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await screen.findByText('입력한 내용을 확인해 주세요. 약 이름은 1~50자, 시각은 1~3개이고 서로 달라야 해요.');
    expect(screen.getByLabelText('약 이름').props.value).toBe('약');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('401 은 오류 문구를 띄우지 않는다', async () => {
    setup({ 'POST /api/pets/pet-1/medications': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(screen.queryByText(/로그인이 만료/)).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('등록 중 404(반려동물 없어짐)면 반려동물을 다시 읽는다', async () => {
    setup({ 'POST /api/pets/pet-1/medications': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(reloadPet).toHaveBeenCalled();
  });
});

describe('중복 제출 방지(같은 프레임 연타)', () => {
  it('등록: 한 렌더 안에서 [약 등록]을 두 번 눌러도 POST 는 한 번', async () => {
    setup({ 'POST /api/pets/pet-1/medications': () => json(201, { ...MED, id: 'med-9' }) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    const btn = screen.getByRole('button', { name: '약 등록' });
    await pressTwiceInOneFrame(btn);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('수정: [고친 내용 저장]을 두 번 눌러도 PUT 은 한 번', async () => {
    setup({ 'PUT /api/medications/med-1': () => json(200, MED) });
    await renderForm('med-1');
    await screen.findByDisplayValue('아조딜');
    const btn = screen.getByRole('button', { name: '고친 내용 저장' });
    await pressTwiceInOneFrame(btn);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });
});

describe('약 수정 폼', () => {
  it('현재 값으로 열리고 안내 문구가 있으며, PUT 하고 목록으로 updated 코드를 싣는다', async () => {
    setup({ 'PUT /api/medications/med-1': () => json(200, MED) });
    await renderForm('med-1');
    await screen.findByDisplayValue('아조딜');
    expect(screen.getByText('약 고치기')).toBeTruthy();
    expect(screen.getByText('ⓘ 시각을 바꾸면 알림 시각도 같이 바뀌어요.')).toBeTruthy();
    expect(screen.getByLabelText('용량 (선택)').props.value).toBe('1캡슐');
    await fireEvent.changeText(screen.getByLabelText('용량 (선택)'), '');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await act(async () => {});
    expect(saved('PUT')?.body).toEqual({ name: '아조딜', doseText: null, times: ['08:00', '20:00'] });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'updated', medId: 'med-1' } });
  });

  it('알림 설정에서 왔으면(from=reminder) 저장 후 그 화면으로 돌아간다', async () => {
    state.params = { from: 'reminder' };
    setup({ 'PUT /api/medications/med-1': () => json(200, MED) });
    await renderForm('med-1');
    await screen.findByDisplayValue('아조딜');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await act(async () => {});
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('수정하려던 약이 목록에 없으면 목록으로 돌아가 gone 안내 코드를 싣는다', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(200, []) });
    await renderForm('med-1');
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'gone' } });
  });

  it('저장 중 404(약이 이미 빠짐)면 목록으로 gone', async () => {
    setup({ 'PUT /api/medications/med-1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderForm('med-1');
    await screen.findByDisplayValue('아조딜');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/medications', params: { notice: 'gone' } });
  });
});

describe('큰 글씨', () => {
  it('글자 배율 1.3 이상이면 스크롤 맨 아래에도 저장 버튼을 한 번 더 둔다(키보드가 올라와 하단 버튼이 숨을 때를 위해)', async () => {
    setFontScale(2);
    setup();
    await renderForm();
    expect(screen.getAllByRole('button', { name: '약 등록' })).toHaveLength(2);
  });

  it('평소 배율에서는 저장 버튼이 하나다', async () => {
    setup();
    await renderForm();
    expect(screen.getAllByRole('button', { name: '약 등록' })).toHaveLength(1);
  });
});
