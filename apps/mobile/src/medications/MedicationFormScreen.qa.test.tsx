// QA 추가: 약 폼 — 경계·연타·실패 롤백·오류 코드
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setFontScale } from '../testing/fontScale';
import { json, MED, PET } from '../testing/fixtures';
import { pickInSheet } from '../testing/mockDateTimePicker';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import MedicationFormScreen from './MedicationFormScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('@react-native-community/datetimepicker', () => require('../testing/mockDateTimePicker'));

const reloadPet = jest.fn();
let calls: { url: string; method: string; body: any }[] = [];
type H = () => Response | Promise<Response>;

function setup(routes: Record<string, H> = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    calls.push({ url: path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const h = routes[`${method} ${path}`];
    if (h) return h();
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
const POST = 'POST /api/pets/pet-1/medications';
const PUT = 'PUT /api/medications/med-1';
const sent = (m: string) => calls.filter((c) => c.method === m);

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
});

describe('QA: 약 폼 입력 경계', () => {
  it('이름 정확히 50자는 등록되고 51자는 요청 없이 막힌다', async () => {
    setup({ [POST]: () => json(201, { ...MED, id: 'med-9' }) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), 'a'.repeat(51));
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    expect(await screen.findAllByText(/약 이름은 50자까지/)).not.toHaveLength(0);
    expect(sent('POST')).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText('약 이름'), 'a'.repeat(50));
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(sent('POST')).toHaveLength(1);
    expect(sent('POST')[0].body.name).toHaveLength(50);
  });

  it('용량 정확히 50자는 그대로 보낸다', async () => {
    setup({ [POST]: () => json(201, { ...MED, id: 'med-9' }) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.changeText(screen.getByLabelText('용량 (선택)'), 'd'.repeat(50));
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(sent('POST')[0].body.doseText).toHaveLength(50);
  });

  it('시각 두 개를 거꾸로 골라도 오름차순으로 보내고, 서로 같게 고르면 막는다', async () => {
    setup({ [POST]: () => json(201, { ...MED, id: 'med-9' }) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.press(screen.getByRole('button', { name: '+ 시각 추가' })); // 08:00, 20:00
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    await pickInSheet(new Date(2026, 9, 8, 20, 0)); // 둘 다 20:00
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    expect(await screen.findAllByText(/같은 시각이 두 번/)).not.toHaveLength(0);
    expect(sent('POST')).toHaveLength(0);

    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오후 8시' }));
    await pickInSheet(new Date(2026, 9, 8, 23, 30)); // 23:30, 20:00
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(sent('POST')[0].body.times).toEqual(['20:00', '23:30']);
  });
});

describe('QA: 약 폼 저장 연타·실패', () => {
  it('저장을 연타해도 요청은 한 번이다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      [POST]: async () => {
        await gate;
        return json(201, { ...MED, id: 'med-9' });
      },
    });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '약');
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await fireEvent.press(screen.getByRole('button', { name: '잠시만요…' }));
    await fireEvent.press(screen.getByRole('button', { name: '잠시만요…' }));
    expect(sent('POST')).toHaveLength(1);
    await act(async () => release());
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('서버 500 이면 오류 문구, 입력값 유지, 이동 없음, 다시 눌러 재시도할 수 있다', async () => {
    let fail = true;
    setup({ [POST]: () => (fail ? json(500, { code: 'INTERNAL', message: 'x' }) : json(201, { ...MED, id: 'med-9' })) });
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '레나');
    await fireEvent.changeText(screen.getByLabelText('용량 (선택)'), '1포');
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(screen.getByLabelText('약 이름').props.value).toBe('레나');
    expect(screen.getByLabelText('용량 (선택)').props.value).toBe('1포');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '약 등록' })).toBeTruthy(); // 잠금 해제
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류도 입력값을 지우지 않는다', async () => {
    setup();
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('약 이름'), '레나');
    await fireEvent.press(screen.getByRole('button', { name: '약 등록' }));
    await act(async () => {});
    expect(screen.getByLabelText('약 이름').props.value).toBe('레나');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});

describe('QA: 약 수정 폼 오류 코드', () => {
  it('수정 400 이면 안내하고 이동 없음 / 401 이면 문구 없음', async () => {
    setup({ [PUT]: () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    await renderForm('med-1');
    await screen.findByDisplayValue('아조딜');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await screen.findByText(/입력한 내용을 확인해 주세요/);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('수정 401 은 조용히 무시', async () => {
    setup({ [PUT]: () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderForm('med-1');
    await screen.findByDisplayValue('아조딜');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await act(async () => {});
    expect(screen.queryByText(/^!|로그인|입력한 내용/)).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('수정 폼 불러오기 401 이면 오류 문구 없이 로딩 상태로 남는다(AuthContext 가 로그인으로 보냄)', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderForm('med-1');
    await act(async () => {});
    expect(screen.queryByText('다시 불러오기')).toBeNull();
  });
});
