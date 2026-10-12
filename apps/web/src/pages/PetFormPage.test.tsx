// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '../lib/api';
import type { Pet } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext, type PetStatus } from '../pet';
import PetFormPage from './PetFormPage';

// 반려동물 등록·수정 화면 현재 동작 고정 테스트(lib/petForm.ts 추출 전 작성, 추출 후에도 그대로 통과해야 한다).
// 사진 부분은 이번 범위가 아니라 다루지 않는다. 실제 서버 없이 fetch 를 가짜로 바꾸고 응답은 계약서 모양 JSON 을 쓴다.

vi.mock('../auth', () => ({ useAuth: () => ({ logout: vi.fn(async () => {}) }) }));

const PET: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2012,
  conditions: '신부전',
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Handler = (body: unknown) => Response | Promise<Response>;
interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) return json(404, { code: 'NOT_FOUND', message: 'not found' });
      return handler(body);
    }),
  );
  return calls;
}

function Where() {
  const loc = useLocation();
  return <p>위치:{loc.pathname + loc.search}</p>;
}

function renderPage(mode: 'new' | 'edit', opts: { status?: PetStatus; pet?: Pet | null } = {}) {
  const reload = vi.fn(async () => {});
  const setPet = vi.fn();
  const path = mode === 'new' ? '/pets/new' : '/pet';
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider
        value={{
          status: opts.status ?? (mode === 'edit' ? 'ready' : 'none'),
          pet: opts.pet === undefined ? (mode === 'edit' ? PET : null) : opts.pet,
          reload,
          setPet,
        }}
      >
        <Routes>
          <Route path="/pets/new" element={<PetFormPage mode="new" />} />
          <Route path="/pet" element={<PetFormPage mode="edit" />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
  return { reload, setPet };
}

const SAVED: Pet = { ...PET, id: 'pet-9', name: '보리', species: 'cat', birthYear: 2015, conditions: '심장병' };

beforeEach(() => {
  setToken('test-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('반려동물 등록 화면 — 검증', () => {
  it('제목·안내·버튼 문구, 종류는 아무것도 고르지 않은 상태', () => {
    renderPage('new');
    expect(screen.getByRole('heading', { name: '반려동물을 소개해 주세요' })).toBeTruthy();
    expect(screen.getByText('이름과 종류만 적어도 시작할 수 있어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다음' })).toBeTruthy();
    for (const r of screen.getAllByRole('radio')) expect(r.getAttribute('aria-checked')).toBe('false');
  });

  it('비워 두고 제출하면 이름·종류 오류를 보이고 서버를 부르지 않는다', async () => {
    const calls = mockServer({});
    renderPage('new');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('이름을 적어 주세요.')).toBeTruthy();
    expect(screen.getByText('개인지 고양이인지 골라 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('공백뿐인 이름은 비어 있는 것으로 본다. 종류만 빠지면 종류 오류만', async () => {
    const calls = mockServer({});
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '   ');
    await userEvent.click(screen.getByRole('radio', { name: /고양이/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('이름을 적어 주세요.')).toBeTruthy();
    expect(screen.queryByText('개인지 고양이인지 골라 주세요.')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('이름이 30자를 넘으면(붙여넣기 등) 오류, 앞뒤 공백은 세지 않는다', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, SAVED) });
    renderPage('new');
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'a'.repeat(31) } });
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('이름은 30자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: ` ${'a'.repeat(30)} ` } });
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0].body as { name: string }).name).toBe('a'.repeat(30));
  });

  it('이름 글자 수는 서버와 같은 UTF-16 길이: 한글 30자 통과·31자 오류, 이모지 15개 통과·16개 오류', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, SAVED) });
    renderPage('new');
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    const submit = () => userEvent.click(screen.getByRole('button', { name: '다음' }));

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '가'.repeat(31) } });
    await submit();
    expect(screen.getByText('이름은 30자까지 적을 수 있어요.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '😀'.repeat(16) } });
    await submit();
    expect(screen.getByText('이름은 30자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '😀'.repeat(15) } });
    await submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0].body as { name: string }).name).toBe('😀'.repeat(15));
  });

  it('태어난 해 칸: 맨 위 "모르거나 적지 않음", 올해부터 1980년까지 내림차순', () => {
    renderPage('new');
    const options = Array.from(screen.getByLabelText('태어난 해 (선택)').querySelectorAll('option'));
    const thisYear = new Date().getFullYear();
    expect(options[0].textContent).toBe('모르거나 적지 않음');
    expect(options[0].value).toBe('');
    expect(options[1].textContent).toBe(`${thisYear}년`);
    expect(options[options.length - 1].textContent).toBe('1980년');
    expect(options).toHaveLength(thisYear - 1980 + 2);
  });
});

describe('반려동물 등록 화면 — 저장', () => {
  it('POST 본문은 이름·질환을 다듬고 해는 숫자로, 성공하면 약 관리 온보딩으로 간다', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, SAVED) });
    const { setPet } = renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '  보리 ');
    await userEvent.click(screen.getByRole('radio', { name: /고양이/ }));
    await userEvent.selectOptions(screen.getByLabelText('태어난 해 (선택)'), '2015');
    await userEvent.type(screen.getByLabelText('앓고 있는 질환 (선택)'), '  심장병 ');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByText('위치:/medications?onboarding=1')).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/api/pets',
      body: { name: '보리', species: 'cat', birthYear: 2015, conditions: '심장병' },
    });
    expect(setPet).toHaveBeenCalledWith(SAVED);
  });

  it('해·질환을 비우면 null 로 보낸다', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, SAVED) });
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    await userEvent.type(screen.getByLabelText('앓고 있는 질환 (선택)'), '   ');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: null, conditions: null });
  });

  it('저장 중에는 버튼이 "잠시만요…" 로 잠기고 다시 눌러도 요청은 한 번뿐', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = mockServer({
      'POST /api/pets': async () => {
        await gate;
        return json(201, SAVED);
      },
    });
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    const busy = await screen.findByRole('button', { name: '잠시만요…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(busy.closest('form')!);
    release();
    await screen.findByText('위치:/medications?onboarding=1');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('서버 400 은 pet 문맥 문구로 알리고 입력값은 그대로 두며 버튼을 다시 연다', async () => {
    mockServer({ 'POST /api/pets': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      '입력한 내용을 확인해 주세요. 이름은 1~30자, 태어난 해는 1980년 이후, 질환은 200자까지 적을 수 있어요.',
    );
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('보리');
    expect((screen.getByRole('button', { name: '다음' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('연결 실패는 공통 연결 문구', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect((await screen.findByRole('alert')).textContent).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('409 PET_LIMIT_REACHED 는 안내 없이 반려동물을 다시 읽는다(reload)', async () => {
    mockServer({ 'POST /api/pets': () => json(409, { code: 'PET_LIMIT_REACHED', message: 'x' }) });
    const { reload } = renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /개/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('등록 화면을 열 때 이미 반려동물이 있으면 오늘 화면으로 보낸다', async () => {
    renderPage('new', { status: 'ready', pet: PET });
    expect(await screen.findByText('위치:/today')).toBeTruthy();
  });
});

describe('반려동물 수정 화면', () => {
  it('저장된 값이 채워져 있고 제목·버튼 문구가 다르다', () => {
    renderPage('edit');
    expect(screen.getByRole('heading', { name: '프로필 수정' })).toBeTruthy();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('초코');
    expect(screen.getByRole('radio', { name: /개/ }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('태어난 해 (선택)') as HTMLSelectElement).value).toBe('2012');
    expect((screen.getByLabelText('앓고 있는 질환 (선택)') as HTMLInputElement).value).toBe('신부전');
    expect(screen.getByRole('button', { name: '프로필 저장' })).toBeTruthy();
    expect(screen.queryByText('이름과 종류만 적어도 시작할 수 있어요.')).toBeNull();
  });

  it('PUT 으로 저장하고 같은 화면에서 "프로필을 저장했어요." 를 보인다', async () => {
    const updated: Pet = { ...PET, name: '초코2', species: 'cat', birthYear: null, conditions: null };
    const calls = mockServer({ 'PUT /api/pets/pet-1': () => json(200, updated) });
    const { setPet } = renderPage('edit');
    const name = screen.getByLabelText('이름');
    await userEvent.clear(name);
    await userEvent.type(name, '초코2');
    await userEvent.click(screen.getByRole('radio', { name: /고양이/ }));
    await userEvent.selectOptions(screen.getByLabelText('태어난 해 (선택)'), '');
    await userEvent.clear(screen.getByLabelText('앓고 있는 질환 (선택)'));
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect((await screen.findByRole('status')).textContent).toBe('프로필을 저장했어요.');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      path: '/api/pets/pet-1',
      body: { name: '초코2', species: 'cat', birthYear: null, conditions: null },
    });
    expect(setPet).toHaveBeenCalledWith(updated);
    expect((screen.getByRole('button', { name: '프로필 저장' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('이름을 지우고 저장하면 오류, 서버를 부르지 않는다', async () => {
    const calls = mockServer({});
    renderPage('edit');
    await userEvent.clear(screen.getByLabelText('이름'));
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    expect(screen.getByText('이름을 적어 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('PUT 404(정보가 없어짐)는 안내 없이 반려동물을 다시 읽는다', async () => {
    mockServer({ 'PUT /api/pets/pet-1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    const { reload } = renderPage('edit');
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('PUT 400 은 pet 문맥 문구', async () => {
    mockServer({ 'PUT /api/pets/pet-1': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    renderPage('edit');
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    expect((await screen.findByRole('alert')).textContent).toContain('입력한 내용을 확인해 주세요.');
  });
});
