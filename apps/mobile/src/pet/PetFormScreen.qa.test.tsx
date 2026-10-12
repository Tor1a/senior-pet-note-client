// QA: 반려동물 폼 화면 보강 — 수정 폼의 오류 분기, 연타, 큰 글씨 경계(1.3 / 2.0), 이모지 이름 경계, 언마운트
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NETWORK_ERROR_MESSAGE } from '../lib/api';
import type { Pet } from '../lib/petApi';
import { pressTwiceInOneFrame } from '../testing/doublePress';
import { setFontScale } from '../testing/fontScale';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import PetFormScreen from './PetFormScreen';
import { PetContext, type PetStatus } from './PetProvider';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const reloadPet = jest.fn(async (_opts?: { keepOnError?: boolean }) => true);
const setPet = jest.fn();
let calls: { url: string; method: string; body: any }[] = [];

function setup(routes: Record<string, () => Response | Promise<Response>> = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    calls.push({ url: path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = routes[`${method} ${path}`];
    if (handler) return handler();
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

function ui(mode: 'new' | 'edit', opts: { status?: PetStatus; pet?: Pet | null } = {}) {
  const status = opts.status ?? (mode === 'edit' ? 'ready' : 'none');
  const pet = opts.pet === undefined ? (mode === 'edit' ? PET : null) : opts.pet;
  return (
    <PetContext.Provider value={{ status, pet, reload: reloadPet, setPet }}>
      <PetFormScreen mode={mode} />
    </PetContext.Provider>
  );
}
const renderForm = (mode: 'new' | 'edit') => render(ui(mode));

const SAVED: Pet = { ...PET, id: 'pet-9', name: '보리', species: 'cat', birthYear: null, conditions: null };
const saveNew = () => screen.getByRole('button', { name: '등록하기' });
const saveEdit = () => screen.getByRole('button', { name: '고친 내용 저장' });
const fillNew = async (name = '보리', species = '개') => {
  await fireEvent.changeText(screen.getByLabelText('이름'), name);
  await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${species},`) }));
};
// 응답이 늦는 요청(gate)을 걸어 둔 채 누를 때: fireEvent.press 는 요청이 끝나길 기다리다 act 가 겹치므로 한 번의 act 안에서 누른다
const pressOnce = (button: ReturnType<typeof screen.getByRole>) =>
  act(async () => {
    (button.props.onClick as (e: unknown) => void)({ nativeEvent: {}, stopPropagation() {}, preventDefault() {} });
  });
const editName = (name: string) => fireEvent.changeText(screen.getByLabelText('이름'), name);

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setPet.mockClear();
  setFontScale(1);
});

describe('QA 등록 폼 — 입력 경계', () => {
  it('종류는 기본으로 아무것도 선택돼 있지 않다(두 버튼 모두 checked=false)', async () => {
    await renderForm('new');
    for (const name of [/^개,/, /^고양이,/]) {
      expect(screen.getByRole('radio', { name }).props.accessibilityState.checked).toBe(false);
    }
  });

  it('이름·질환 입력칸은 maxLength 30·200 을 갖는다', async () => {
    await renderForm('new');
    expect(screen.getByLabelText('이름').props.maxLength).toBe(30);
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.maxLength).toBe(200);
  });

  it('이름 공백만 → 오류, 요청 없음', async () => {
    setup();
    await renderForm('new');
    await fillNew('     ');
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 이름을 적어 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('이모지 이름 15개(UTF-16 30)는 저장되고, 16개(32)는 오류 — 서버 기준과 같다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew('😀'.repeat(16));
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 이름은 30자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
    await fillNew('😀'.repeat(15));
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.name).toBe('😀'.repeat(15));
  });

  it('한글 30자 + 앞뒤 공백 → 공백을 자른 30자를 보낸다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew(`  ${'가'.repeat(30)}  `);
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.name).toBe('가'.repeat(30));
  });

  it('질환 공백만/줄바꿈만 → null 로 보낸다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew();
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), ' \n  \n ');
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.conditions).toBeNull();
  });

  it('질환 200자는 그대로 보내고, 이모지 100개(UTF-16 200)도 보낸다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew();
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), '😀'.repeat(100));
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.conditions).toBe('😀'.repeat(100));
  });

  it('고양이를 골라 등록하면 species=cat, 해 선택 안 함이면 birthYear=null', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew('나비', '고양이');
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '나비', species: 'cat', birthYear: null, conditions: null });
  });

  it('이름만 채우고 종류를 안 골랐을 때: 종류 오류만 보이고 이름 오류는 없다', async () => {
    setup();
    await renderForm('new');
    await editName('보리');
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 개인지 고양이인지 골라 주세요.')).toBeTruthy();
    expect(screen.queryByText('! 이름을 적어 주세요.')).toBeNull();
    expect(screen.getByText('빠진 곳이 있어요. 표시된 칸을 확인해 주세요.')).toBeTruthy();
  });
});

describe('QA 등록 폼 — 저장 연타·실패·재시도', () => {
  it('실패 후 다시 눌러 성공한 뒤 연타해도 POST 는 성공 1번 + 실패 1번(총 2번)이다', async () => {
    let n = 0;
    setup({ 'POST /api/pets': () => (++n === 1 ? json(500, { code: 'INTERNAL', message: 'x' }) : json(201, SAVED)) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await screen.findByText('서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    expect(screen.queryByText('입력한 내용은 그대로 있어요.')).toBeNull(); // 연결 실패일 때만 안내
    await pressTwiceInOneFrame(saveNew());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('오프라인 실패 후: 입력(이름·종류·해·질환) 모두 유지, 일부를 고쳐 다시 보내면 고친 값이 간다', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await renderForm('new');
    await fillNew('보리', '고양이');
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 선택 안 함' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2012년' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), '심장병');
    await fireEvent.press(saveNew());
    await screen.findByText(NETWORK_ERROR_MESSAGE);
    expect(screen.getByLabelText('이름').props.value).toBe('보리');
    expect(screen.getByRole('radio', { name: /^고양이,/ }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('button', { name: '태어난 해, 2012년' })).toBeTruthy();
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.value).toBe('심장병');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await editName('보리2');
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리2', species: 'cat', birthYear: 2012, conditions: '심장병' });
  });

  it('네트워크 오류 안내는 스크린리더에도 읽어 준다', async () => {
    const { AccessibilityInfo } = require('react-native');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await screen.findByText(NETWORK_ERROR_MESSAGE);
    expect(announce).toHaveBeenCalledWith(`${NETWORK_ERROR_MESSAGE} 입력한 내용은 그대로 있어요.`);
    announce.mockRestore();
  });

  it('등록 중 404 는 gone 이 아니라 일반 문구(정보를 찾지 못했어요)', async () => {
    setup({ 'POST /api/pets': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await screen.findByText('정보를 찾지 못했어요. 화면을 새로 불러와 주세요.');
    expect(reloadPet).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('409 로 시작 화면에서 되돌아갈 때 reload 가 오래 걸려도 POST 는 한 번뿐', async () => {
    setup({ 'POST /api/pets': () => json(409, { code: 'PET_LIMIT_REACHED', message: 'x' }) });
    let release!: () => void;
    reloadPet.mockImplementationOnce(() => new Promise<boolean>((r) => (release = () => r(true))));
    await renderForm('new');
    await fillNew();
    await pressTwiceInOneFrame(saveNew());
    await waitFor(() => expect(reloadPet).toHaveBeenCalledTimes(1));
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('요청 중 화면이 사라져도(언마운트) setPet 은 하고, 이동·상태 변경 오류는 없다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'POST /api/pets': async () => {
        await gate;
        return json(201, SAVED);
      },
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const view = await renderForm('new');
    await fillNew();
    await pressOnce(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => view.unmount());
    await act(async () => {
      release();
    });
    await waitFor(() => expect(setPet).toHaveBeenCalledWith(SAVED));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('저장 중에는 입력이 잠긴다(이름·질환 editable=false, 종류 disabled)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'POST /api/pets': async () => {
        await gate;
        return json(201, SAVED);
      },
    });
    await renderForm('new');
    await fillNew();
    await pressOnce(saveNew());
    await waitFor(() => expect(screen.getByLabelText('이름').props.editable).toBe(false));
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.editable).toBe(false);
    expect(screen.getByRole('radio', { name: /^고양이,/ }).props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
  });
});

describe('QA 수정 폼 — 오류 분기·연타', () => {
  it('저장 연타해도 PUT 은 한 번', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'PUT /api/pets/pet-1': async () => {
        await gate;
        return json(200, { ...PET, name: '콩이' });
      },
    });
    await renderForm('edit');
    await editName('콩이');
    await pressTwiceInOneFrame(saveEdit());
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('PUT 409 PET_LIMIT_REACHED 도 limit 처리(다시 읽고 오늘로)', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(409, { code: 'PET_LIMIT_REACHED', message: 'x' }) });
    await renderForm('edit');
    await editName('콩이');
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { notice: 'petLimit' } });
  });

  it('PUT 401 은 조용히 무시, 버튼은 다시 열린다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderForm('edit');
    await editName('콩이');
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(saveEdit().props.accessibilityState.disabled).toBe(false));
    expect(screen.queryByText(/로그인이 만료/)).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('PUT 500 은 서버 문제 문구 + 입력 유지', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(503, { code: 'X', message: 'x' }) });
    await renderForm('edit');
    await editName('콩이');
    await fireEvent.press(saveEdit());
    await screen.findByText('서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.');
    expect(screen.getByLabelText('이름').props.value).toBe('콩이');
  });

  it('오프라인 실패 → 입력 유지 → 재시도 성공', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await renderForm('edit');
    await editName('콩이');
    await fireEvent.press(saveEdit());
    await screen.findByText(NETWORK_ERROR_MESSAGE);
    expect(screen.getByText('입력한 내용은 그대로 있어요.')).toBeTruthy();
    setup({ 'PUT /api/pets/pet-1': () => json(200, { ...PET, name: '콩이' }) });
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(calls[0].body.name).toBe('콩이');
  });

  it('질환을 비우고 태어난 해를 지우면 둘 다 null 로 PUT', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(200, { ...PET, birthYear: null, conditions: null }) });
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), '');
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 2012년' }));
    await fireEvent.press(screen.getByRole('radio', { name: '모르거나 적지 않음' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: null, conditions: null });
  });

  it('태어난 해 시트 [취소]만 한 수정 폼은 변경 없음 → 뒤로가 바로 나간다', async () => {
    await renderForm('edit');
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 2012년' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2001년' }));
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });

  it('수정 저장 중에는 뒤로를 눌러도 나가지 않는다(버튼 잠김)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'PUT /api/pets/pet-1': async () => {
        await gate;
        return json(200, PET);
      },
    });
    await renderForm('edit');
    await editName('콩이');
    await pressOnce(saveEdit());
    await waitFor(() => expect(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }).props.accessibilityState.disabled).toBe(true));
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
  });

  it('수정 폼의 pet 이 없는 상태(방어)에서 저장해도 요청하지 않는다', async () => {
    setup();
    await render(ui('edit', { status: 'ready', pet: null }));
    await fireEvent.changeText(screen.getByLabelText('이름'), '콩이');
    await fireEvent.press(saveEdit());
    expect(calls).toHaveLength(0);
  });
});

describe('QA 큰 글씨', () => {
  it('배율 1.29 는 평소 배치(가로, 저장 버튼 1개)', async () => {
    setFontScale(1.29);
    await renderForm('new');
    expect(screen.getByLabelText('종류').props.style.flexDirection).toBe('row');
    expect(screen.getAllByRole('button', { name: '등록하기' })).toHaveLength(1);
  });

  it('배율 1.3 은 세로 + 저장 버튼 2개(경계값)', async () => {
    setFontScale(1.3);
    await renderForm('new');
    expect(screen.getByLabelText('종류').props.style.flexDirection).toBe('column');
    expect(screen.getAllByRole('button', { name: '등록하기' })).toHaveLength(2);
  });

  it('배율 2.0: 검증 요약·오류는 한 번만 보이고(중복 없음), 저장 버튼은 2개, 어느 쪽 버튼으로도 저장된다', async () => {
    setFontScale(2);
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fireEvent.press(screen.getAllByRole('button', { name: '등록하기' })[1]);
    expect(screen.getAllByText('빠진 곳이 있어요. 표시된 칸을 확인해 주세요.')).toHaveLength(1);
    expect(screen.getAllByText('! 이름을 적어 주세요.')).toHaveLength(1);
    await fillNew();
    await fireEvent.press(screen.getAllByRole('button', { name: '등록하기' })[1]);
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(calls).toHaveLength(1);
  });

  it('배율 2.0: 서버 오류 문구도 한 번만, 이탈 확인 카드도 한 번만 보인다', async () => {
    setFontScale(2);
    setup({ 'POST /api/pets': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(screen.getAllByRole('button', { name: '등록하기' })[0]);
    await screen.findAllByText(/입력한 내용을 확인해 주세요/);
    expect(screen.getAllByText(/입력한 내용을 확인해 주세요/)).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
    expect(screen.getAllByText('저장하지 않고 나갈까요?')).toHaveLength(1);
  });

  it('배율 2.0: 수정 폼에서도 [고친 내용 저장] 2개, 사진 안내 한 줄', async () => {
    setFontScale(2);
    await renderForm('edit');
    expect(screen.getAllByRole('button', { name: '고친 내용 저장' })).toHaveLength(2);
    expect(screen.getAllByText('사진은 지금은 웹에서만 바꿀 수 있어요.')).toHaveLength(1);
  });
});
