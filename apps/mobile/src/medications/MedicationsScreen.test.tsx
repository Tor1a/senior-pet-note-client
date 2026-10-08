import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { pressTwiceInOneFrame } from '../testing/doublePress';
import { setFontScale } from '../testing/fontScale';
import { json, MED, PET, reminderExample } from '../testing/fixtures';
import { mockRouter, resetRouterMocks, state } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushDeviceState } from '../push/pushContext';
import MedicationsScreen from './MedicationsScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const reloadPet = jest.fn();
let calls: { url: string; method: string }[] = [];
type Routes = Record<string, () => Response>;

function setup(routes: Routes = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    calls.push({ url: path, method });
    const handler = routes[`${method} ${path}`];
    if (handler) return handler();
    if (method === 'GET' && path === '/api/pets/pet-1/medications') return json(200, [MED]);
    if (method === 'GET' && path === '/api/medications/med-1/reminder') return json(200, reminderExample());
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

const push = (s: PushDeviceState) => ({
  state: s,
  requestPermission: jest.fn(async () => s),
  recheck: jest.fn(async () => s),
  bannerVisible: false,
  subscribe: () => () => {},
});

async function renderList(pushState: PushDeviceState = 'registered') {
  await render(
    <PushContext.Provider value={push(pushState)}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
        <MedicationsScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
}

const second = { ...MED, id: 'med-2', name: '레나메진', doseText: null, times: ['09:00'] };

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
});

describe('약 목록 — 알림 진입점과 상태 줄', () => {
  it('약 카드에 이름·용량·시각, 알림 상태 줄, [고치기]·[알림 설정]이 있다', async () => {
    setup();
    await renderList();
    await screen.findByText('▣ 알림 켜짐 · 월·수');
    expect(screen.getByText('오전 8:00 · 오후 8:00')).toBeTruthy();
    expect(screen.getByText(/1캡슐/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '아조딜 고치기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '아조딜 알림 설정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '아조딜 목록에서 빼기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '오늘 화면으로' })).toBeTruthy();
  });

  it('상태 줄·[알림 설정]을 누르면 알림 설정 화면으로, [고치기]는 수정 화면으로 간다', async () => {
    setup();
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: /^아조딜 알림 켜짐/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-1/reminder');
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 알림 설정' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-1/reminder');
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 고치기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-1/edit');
    await fireEvent.press(screen.getByRole('button', { name: '+ 약 추가' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/new');
  });

  it('켜짐인데 이 기기에서 못 받으면 2줄째 안내와 라벨 문장', async () => {
    setup();
    await renderList('denied');
    await screen.findByText('이 기기에서는 받을 수 없어요');
    expect(
      screen.getByRole('button', {
        name: '아조딜 알림 켜짐, 월·수. 오전 8:00와 오후 8:00. 이 기기에서는 받을 수 없어요. 누르면 알림 설정으로 가요',
      }),
    ).toBeTruthy();
  });

  it('약마다 알림 설정을 따로 부르고, 하나가 실패해도 나머지는 표시하며 [알림 설정]은 남는다', async () => {
    setup({
      'GET /api/pets/pet-1/medications': () => json(200, [MED, second]),
      'GET /api/medications/med-2/reminder': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    await renderList();
    await screen.findByText('▣ 알림 켜짐 · 월·수');
    expect(calls.filter((c) => c.url.endsWith('/reminder'))).toHaveLength(2);
    expect(screen.getByRole('button', { name: '레나메진 알림 설정' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^레나메진 알림 (켜짐|꺼짐)/ })).toBeNull();
  });

  it('꺼짐·기간 끝남 문구', async () => {
    setup({
      'GET /api/pets/pet-1/medications': () => json(200, [MED, second]),
      'GET /api/medications/med-1/reminder': () => json(200, reminderExample({ enabled: false, nextFireAt: null })),
      'GET /api/medications/med-2/reminder': () => json(200, reminderExample({ medicationId: 'med-2', nextFireAt: null })),
    });
    await renderList();
    await screen.findByText('□ 알림 꺼짐');
    expect(screen.getByText('▣ 알림 기간이 끝났어요')).toBeTruthy();
  });

  it('알림 설정 요청이 401 이어도 오류 문구는 없다', async () => {
    setup({ 'GET /api/medications/med-1/reminder': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderList();
    await screen.findByText(/^아조딜/);
    await act(async () => {});
    expect(screen.queryByText(/로그인이 만료/)).toBeNull();
  });
});

describe('약 목록 — 빈 상태·불러오기 오류', () => {
  it('약이 0개면 안내 카드와 [+ 약 등록하기](폼으로 자동 이동하지 않는다)', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(200, []) });
    await renderList();
    await screen.findByText('아직 등록한 약이 없어요.');
    expect(screen.queryByRole('button', { name: '+ 약 추가' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '+ 약 등록하기' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/medications/new');
  });

  it('목록을 못 불러오면 안내와 [다시 불러오기]', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(500, { code: 'INTERNAL', message: 'x' }) });
    await renderList();
    await screen.findByText(/^! /);
    setup();
    await fireEvent.press(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByText(/^아조딜/);
  });

  it('404 면 반려동물을 다시 읽는다', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderList();
    await act(async () => {});
    expect(reloadPet).toHaveBeenCalled();
  });

  it('돌아올 때(재포커스)마다 목록과 알림 상태를 다시 읽는다', async () => {
    setup();
    await renderList();
    await screen.findByText('▣ 알림 켜짐 · 월·수');
    await act(async () => {
      state.focusCb?.();
    });
    expect(calls.filter((c) => c.url === '/api/pets/pet-1/medications')).toHaveLength(2);
  });
});

describe('약 목록 — 삭제', () => {
  it('[목록에서 빼기] → 확인 → [그대로 두기]는 요청 없이 닫는다', async () => {
    setup();
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
    expect(screen.getByText('아조딜을(를) 목록에서 뺄까요?')).toBeTruthy();
    expect(screen.getByText('지난 기록은 남아요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '그대로 두기' }));
    expect(screen.queryByText('아조딜을(를) 목록에서 뺄까요?')).toBeNull();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('[빼기] → DELETE → 안내와 재조회, 0개가 되면 빈 상태', async () => {
    let meds = [MED];
    setup({
      'GET /api/pets/pet-1/medications': () => json(200, meds),
      'DELETE /api/medications/med-1': () => {
        meds = [];
        return json(204, null);
      },
    });
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await screen.findByText('✓ 아조딜을(를) 목록에서 뺐어요. 지난 기록은 그대로 남아요.');
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    await screen.findByText('아직 등록한 약이 없어요.');
  });

  it('삭제 중 404(약이 이미 빠짐)면 반려동물을 읽지 않고 목록만 다시 읽어 안내한다', async () => {
    let meds = [MED, second];
    setup({
      'GET /api/pets/pet-1/medications': () => json(200, meds),
      'DELETE /api/medications/med-1': () => {
        meds = [second]; // 다른 기기에서 이미 뺌
        return json(404, { code: 'NOT_FOUND', message: 'x' });
      },
    });
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await screen.findByText('이미 목록에서 빠진 약이에요. 목록을 다시 불러왔어요.');
    expect(reloadPet).not.toHaveBeenCalled();
    expect(screen.queryByText('아조딜을(를) 목록에서 뺄까요?')).toBeNull();
    expect(screen.queryByText(/아조딜/)).toBeNull();
    expect(calls.filter((c) => c.url === '/api/pets/pet-1/medications')).toHaveLength(2);
  });

  it('목록을 다시 읽다가도 404 면(반려동물이 없어짐) 반려동물을 다시 읽는다', async () => {
    let gone = false;
    setup({
      'GET /api/pets/pet-1/medications': () => (gone ? json(404, { code: 'NOT_FOUND', message: 'x' }) : json(200, [MED])),
      'DELETE /api/medications/med-1': () => {
        gone = true;
        return json(404, { code: 'NOT_FOUND', message: 'x' });
      },
    });
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 빼기' }));
    await act(async () => {});
    expect(reloadPet).toHaveBeenCalled();
  });

  it('[빼기]를 같은 프레임에 두 번 눌러도 DELETE 는 한 번', async () => {
    setup({ 'DELETE /api/medications/med-1': () => json(204, null) });
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
    const btn = screen.getByRole('button', { name: '아조딜 빼기' });
    await pressTwiceInOneFrame(btn);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('큰 글씨에서는 확인 버튼을 세로로 쌓고 [그대로 두기]가 위에 온다', async () => {
    setFontScale(2);
    setup();
    await renderList();
    await fireEvent.press(await screen.findByRole('button', { name: '아조딜 목록에서 빼기' }));
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names.indexOf('그대로 두기')).toBeLessThan(names.indexOf('아조딜 빼기'));
  });
});

describe('약 목록 — 다른 화면에서 돌아온 안내', () => {
  it('created: 등록했어요 + 알림을 받아 볼까요? + [알림 설정하기 ›] (이름은 목록에서 찾고 파라미터는 지운다)', async () => {
    state.params = { notice: 'created', medId: 'med-1' };
    setup();
    await renderList();
    await screen.findByText('✓ 아조딜을(를) 등록했어요.');
    expect(screen.getByText('먹일 시간에 알림을 받아 볼까요?')).toBeTruthy();
    expect(mockRouter.setParams).toHaveBeenCalledWith({ notice: undefined, medId: undefined });
    await fireEvent.press(screen.getByRole('button', { name: '알림 설정하기 ›' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-1/reminder');
  });

  it('updated: 정보를 고쳤어요(알림 설정하기 없음)', async () => {
    state.params = { notice: 'updated', medId: 'med-1' };
    setup();
    await renderList();
    await screen.findByText('✓ 아조딜 정보를 고쳤어요.');
    expect(screen.queryByText('먹일 시간에 알림을 받아 볼까요?')).toBeNull();
  });

  it('gone: 목록에서 뺀 약이에요', async () => {
    state.params = { notice: 'gone' };
    setup();
    await renderList();
    await screen.findByText('목록에서 뺀 약이에요. 약 목록으로 돌아왔어요.');
  });

  it('알 수 없는 코드나 자유 텍스트는 보여 주지 않는다', async () => {
    state.params = { notice: '<b>가짜 안내</b>' };
    setup();
    await renderList();
    await screen.findByText(/^아조딜/);
    expect(screen.queryByText(/가짜 안내/)).toBeNull();
  });

  it('버튼 라벨에 약 이름이 들어 있어 약이 여럿이어도 어느 약의 버튼인지 구분된다', async () => {
    setup({ 'GET /api/pets/pet-1/medications': () => json(200, [MED, second]) });
    await renderList();
    await screen.findByText(/^레나메진/);
    await fireEvent.press(screen.getByRole('button', { name: '레나메진 고치기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-2/edit');
    await fireEvent.press(screen.getByRole('button', { name: '아조딜 고치기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/medications/med-1/edit');
  });
});
