// QA 추가: 약 목록 삭제 — 실패·401·연타·취소 후 재시도
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setFontScale } from '../testing/fontScale';
import { json, MED, PET, reminderExample } from '../testing/fixtures';
import { resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import MedicationsScreen from './MedicationsScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const reloadPet = jest.fn();
let calls: { url: string; method: string }[] = [];
type H = () => Response | Promise<Response>;

function setup(routes: Record<string, H> = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    calls.push({ url: path, method });
    const h = routes[`${method} ${path}`];
    if (h) return h();
    if (method === 'GET' && path === '/api/pets/pet-1/medications') return json(200, [MED]);
    if (method === 'GET' && path === '/api/medications/med-1/reminder') return json(200, reminderExample());
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}
async function renderList() {
  await render(
    <PushContext.Provider
      value={{ state: 'registered', requestPermission: jest.fn(), recheck: jest.fn(), bannerVisible: false, subscribe: () => () => {} } as never}
    >
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
        <MedicationsScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
}
const askDelete = async () => fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
const del = () => calls.filter((c) => c.method === 'DELETE');

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
});

describe('QA: 약 삭제', () => {
  it('서버 500 이면 오류 문구를 보이고 약은 목록에 남으며 성공 문구는 없다', async () => {
    setup({ 'DELETE /api/medications/med-1': () => json(500, { code: 'INTERNAL', message: 'x' }) });
    await renderList();
    await askDelete();
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await act(async () => {});
    expect(screen.queryByText(/목록에서 뺐어요/)).toBeNull();
    expect(screen.getByRole('button', { name: '그대로 두기' })).toBeTruthy(); // 약은 남아 있고 확인 카드도 그대로
    expect(screen.getByText(/^!/)).toBeTruthy();
  });

  it('삭제 401 은 오류 문구 없이 끝난다', async () => {
    setup({ 'DELETE /api/medications/med-1': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderList();
    await askDelete();
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await act(async () => {});
    expect(screen.queryByText(/^!|로그인|뺐어요/)).toBeNull();
  });

  it('[빼기] 연타해도 DELETE 는 한 번이다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'DELETE /api/medications/med-1': async () => {
        await gate;
        return json(204, null);
      },
    });
    await renderList();
    await askDelete();
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    expect(del()).toHaveLength(1);
    await act(async () => release());
  });

  it('취소 후 다시 열어도 확인 카드가 정상이고, 실패 뒤에도 다시 시도할 수 있다', async () => {
    let fail = true;
    setup({ 'DELETE /api/medications/med-1': () => (fail ? json(500, { code: 'I', message: 'x' }) : json(204, null)) });
    await renderList();
    await askDelete();
    await fireEvent.press(screen.getByRole('button', { name: '그대로 두기' }));
    await askDelete();
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await act(async () => {});
    fail = false;
    const retry = screen.queryByRole('button', { name: '아조딜 빼기' }) ?? (await askDelete(), screen.getByRole('button', { name: '아조딜 빼기' }));
    await fireEvent.press(retry);
    await act(async () => {});
    expect(del()).toHaveLength(2);
  });
});
