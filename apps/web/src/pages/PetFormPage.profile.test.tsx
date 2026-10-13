// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pet } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import PetFormPage from './PetFormPage';

// 반려동물 폼의 "함께 지내는 상황"(유형) · "날짜 자세히 적기"(생일 월·일, 입양일). 기존 폼 동작은 PetFormPage.test.tsx 가 고정한다.
// 기기 날짜는 2026-10-13 으로 고정한다(미래 날짜 검사).

vi.mock('../auth', () => ({ useAuth: () => ({ logout: vi.fn(async () => {}) }) }));

const BASE: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2012,
  conditions: '신부전',
  hasPhoto: false,
  profileType: null,
  birthDate: null,
  adoptedOn: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const FULL: Pet = { ...BASE, birthYear: 2015, profileType: 'senior', birthDate: '2015-03-02', adoptedOn: '2016-01-10' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockServer(handlers: Record<string, (body: unknown) => Response>) {
  const calls: { method: string; path: string; body: Record<string, unknown> | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      const h = handlers[`${method} ${url.pathname}`];
      return h ? h(body) : json(404, { code: 'NOT_FOUND', message: 'x' });
    }),
  );
  return calls;
}

function renderPage(mode: 'new' | 'edit', pet: Pet | null = mode === 'edit' ? BASE : null) {
  render(
    <MemoryRouter initialEntries={[mode === 'new' ? '/pets/new' : '/pet']}>
      <PetContext.Provider value={{ status: mode === 'edit' ? 'ready' : 'none', pet, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/pets/new" element={<PetFormPage mode="new" />} />
          <Route path="/pet" element={<PetFormPage mode="edit" />} />
          <Route path="*" element={<p>다른 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

const toggle = () => screen.getByRole('button', { name: /날짜 자세히 적기/ });
const select = (label: string, group: string) =>
  within(screen.getByRole('group', { name: group, hidden: true })).getByLabelText(label) as HTMLSelectElement;

beforeEach(() => {
  setToken('test-token');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 13, 2, 0, 0)); // 새벽 2시여도 오늘 달력 날짜는 13일
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('유형 선택 (함께 지내는 상황)', () => {
  it('제목·라벨 3개·보조문구, 기본은 "나중에 정할게요"가 ✓ 로 선택돼 있다', () => {
    renderPage('new');
    expect(screen.getByText('함께 지내는 상황 (선택)')).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: '함께 지내는 상황' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent?.replace('✓ ', ''))).toEqual(['처음 키워요', '나이 든 아이예요', '나중에 정할게요']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(radios[2].textContent).toContain('✓');
    expect(screen.getByText('화면에서 보이는 안내만 달라져요. 나이 기준은 없고, 언제든 바꿀 수 있어요.')).toBeTruthy();
  });

  it('등록: 아무것도 안 누르면 본문에 새 키가 없다', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, { ...BASE, id: 'p2', name: '보리' }) });
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /🐶 개/ }));
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    expect(Object.keys(calls[0].body!).sort()).toEqual(['birthYear', 'conditions', 'name', 'species']);
  });

  it('등록: 유형·생일·입양일을 고르면 계약 모양으로 보낸다(연도는 태어난 해)', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, { ...FULL, id: 'p2' }) });
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /🐶 개/ }));
    await userEvent.click(screen.getByRole('radio', { name: '처음 키워요' }));
    await userEvent.selectOptions(screen.getByLabelText('태어난 해 (선택)'), '2015');
    await userEvent.click(toggle());
    await userEvent.selectOptions(select('월', '생일 (선택)'), '3');
    await userEvent.selectOptions(select('일', '생일 (선택)'), '2');
    await userEvent.selectOptions(select('연도', '입양일 (선택)'), '2016');
    await userEvent.selectOptions(select('월', '입양일 (선택)'), '1');
    await userEvent.selectOptions(select('일', '입양일 (선택)'), '10');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls[0].body).toEqual({
      name: '보리',
      species: 'dog',
      birthYear: 2015,
      conditions: null,
      profileType: 'first_time',
      birthDate: '2015-03-02',
      adoptedOn: '2016-01-10',
    });
  });
});

describe('날짜 자세히 적기', () => {
  it('값이 없으면 접힌 채 시작하고 열고 닫아도 값은 유지된다', async () => {
    renderPage('new');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('정확한 날짜를 모르면 비워 두어도 괜찮아요.').closest('[hidden]')).toBeTruthy();
    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    await userEvent.selectOptions(select('월', '생일 (선택)'), '5');
    await userEvent.click(toggle());
    expect(select('월', '생일 (선택)').value).toBe('5');
  });

  it('접힌 상태에서 값이 있으면 요약 한 줄을 보인다(펼친 채 열리므로 닫으면 보임)', async () => {
    renderPage('edit', FULL);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(toggle());
    expect(screen.getByText('생일 3월 2일 · 입양 2016년 1월 10일')).toBeTruthy();
  });

  it('입양일을 일부만 고르면 서버를 부르지 않고 칸 아래 오류, 접힘이 열리고 첫 오류 칸에 포커스', async () => {
    const calls = mockServer({});
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /🐶 개/ }));
    await userEvent.click(toggle());
    await userEvent.selectOptions(select('연도', '입양일 (선택)'), '2020');
    await userEvent.click(toggle()); // 접어 둔 채 제출
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('입양일은 연도, 월, 일을 모두 골라 주세요. 모르면 비워 두어도 괜찮아요.')).toBeTruthy();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(select('연도', '입양일 (선택)'));
    expect(select('연도', '입양일 (선택)').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toHaveLength(0);
    // 다시 고르면 그 칸 그룹의 오류가 사라진다
    await userEvent.selectOptions(select('월', '입양일 (선택)'), '5');
    expect(screen.queryByText(/입양일은 연도, 월, 일을 모두/)).toBeNull();
  });

  it('생일 월·일은 태어난 해 없이 저장할 수 없다', async () => {
    const calls = mockServer({});
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /🐶 개/ }));
    await userEvent.click(toggle());
    await userEvent.selectOptions(select('월', '생일 (선택)'), '3');
    await userEvent.selectOptions(select('일', '생일 (선택)'), '2');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('생일의 월과 일을 적으려면 태어난 해를 먼저 골라 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('미래 날짜는 기기 달력 날짜 기준(오늘은 가능, 내일은 불가)', async () => {
    const calls = mockServer({ 'POST /api/pets': () => json(201, { ...BASE, id: 'p2' }) });
    renderPage('new');
    await userEvent.type(screen.getByLabelText('이름'), '보리');
    await userEvent.click(screen.getByRole('radio', { name: /🐶 개/ }));
    await userEvent.click(toggle());
    await userEvent.selectOptions(select('연도', '입양일 (선택)'), '2026');
    await userEvent.selectOptions(select('월', '입양일 (선택)'), '10');
    await userEvent.selectOptions(select('일', '입양일 (선택)'), '14');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('미래 날짜는 고를 수 없어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
    await userEvent.selectOptions(select('일', '입양일 (선택)'), '13');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ adoptedOn: '2026-10-13' });
  });

  it('입양일이 생일보다 빠르면 오류', async () => {
    mockServer({});
    renderPage('edit', FULL);
    await userEvent.selectOptions(select('연도', '입양일 (선택)'), '2015');
    await userEvent.selectOptions(select('월', '입양일 (선택)'), '3');
    await userEvent.selectOptions(select('일', '입양일 (선택)'), '1');
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    expect(screen.getByText('입양일이 생일보다 빠를 수 없어요.')).toBeTruthy();
  });

  it('생일 칸을 바꾸면 낡은 "입양일이 생일보다 빠를 수 없어요" 오류도 지운다', async () => {
    mockServer({});
    renderPage('edit', FULL);
    await userEvent.selectOptions(select('연도', '입양일 (선택)'), '2015');
    await userEvent.selectOptions(select('월', '입양일 (선택)'), '3');
    await userEvent.selectOptions(select('일', '입양일 (선택)'), '1');
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    expect(screen.getByText('입양일이 생일보다 빠를 수 없어요.')).toBeTruthy();
    await userEvent.selectOptions(select('월', '생일 (선택)'), '1');
    expect(screen.queryByText('입양일이 생일보다 빠를 수 없어요.')).toBeNull();
  });

  it('태어난 해를 바꿔 2/29 가 사라지면 일만 비우고 안내한다. 해를 지우면 월·일도 비운다', async () => {
    mockServer({});
    renderPage('edit', { ...BASE, birthYear: 2024, birthDate: '2024-02-29' });
    await userEvent.selectOptions(screen.getByLabelText('태어난 해 (선택)'), '2023');
    expect(select('월', '생일 (선택)').value).toBe('2');
    expect(select('일', '생일 (선택)').value).toBe('');
    expect(screen.getByRole('status').textContent).toBe('고른 날짜가 없는 날이라 일을 비웠어요. 일을 다시 골라 주세요.');
    await userEvent.selectOptions(screen.getByLabelText('태어난 해 (선택)'), '');
    expect(select('월', '생일 (선택)').value).toBe('');
    expect(screen.getByRole('status').textContent).toBe('태어난 해를 지워서 생일 월·일도 비웠어요.');
  });

  it('일 목록은 고른 해·월의 말일까지다', async () => {
    renderPage('new');
    await userEvent.selectOptions(screen.getByLabelText('태어난 해 (선택)'), '2023');
    await userEvent.click(toggle());
    await userEvent.selectOptions(select('월', '생일 (선택)'), '2');
    expect(within(select('일', '생일 (선택)')).getAllByRole('option', { hidden: true })).toHaveLength(29); // 선택 안 함 + 1~28
  });
});

describe('수정 화면', () => {
  it('기존 사용자(유형 null, 날짜 없음): "나중에" 선택, 접힘, 아무것도 안 바꾸고 저장하면 PUT 본문에 새 키가 없다', async () => {
    const calls = mockServer({ 'PUT /api/pets/pet-1': () => json(200, BASE) });
    renderPage('edit');
    const radios = within(screen.getByRole('radiogroup', { name: '함께 지내는 상황' })).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle()); // 열었다 닫아도 변화 없음
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls[0].body).toEqual({ name: '초코', species: 'dog', birthYear: 2012, conditions: '신부전' });
  });

  it('저장된 값이 채워져 펼친 채 열리고, 안 바꾸면 새 키가 없다. 지우면 null 을 명시한다', async () => {
    const calls = mockServer({ 'PUT /api/pets/pet-1': () => json(200, BASE) });
    renderPage('edit', FULL);
    expect(screen.getByRole('radio', { name: '나이 든 아이예요' }).getAttribute('aria-checked')).toBe('true');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(select('월', '생일 (선택)').value).toBe('3');
    expect(select('연도', '입양일 (선택)').value).toBe('2016');
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(Object.keys(calls[0].body!).sort()).toEqual(['birthYear', 'conditions', 'name', 'species']);

    await userEvent.click(screen.getByRole('radio', { name: '나중에 정할게요' }));
    await userEvent.selectOptions(select('월', '생일 (선택)'), '');
    await userEvent.selectOptions(select('일', '생일 (선택)'), '');
    await userEvent.selectOptions(select('연도', '입양일 (선택)'), '');
    await userEvent.selectOptions(select('월', '입양일 (선택)'), '');
    await userEvent.selectOptions(select('일', '입양일 (선택)'), '');
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).toMatchObject({ birthYear: 2015, profileType: null, birthDate: null, adoptedOn: null });
  });

  it('유형만 바꾸면 profileType 만 추가되고 확인 창은 없다', async () => {
    const calls = mockServer({ 'PUT /api/pets/pet-1': () => json(200, { ...BASE, profileType: 'first_time' }) });
    renderPage('edit');
    await userEvent.click(screen.getByRole('radio', { name: '처음 키워요' }));
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '초코', species: 'dog', birthYear: 2012, conditions: '신부전', profileType: 'first_time' });
    expect(await screen.findByText('프로필을 저장했어요.')).toBeTruthy();
  });

  it('서버 400 은 날짜까지 포함한 문구로 알린다', async () => {
    mockServer({ 'PUT /api/pets/pet-1': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    renderPage('edit');
    await userEvent.click(screen.getByRole('radio', { name: '처음 키워요' }));
    await userEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    expect((await screen.findByRole('alert')).textContent).toContain('태어난 해와 날짜는 1980년 이후부터 오늘까지');
  });
});
