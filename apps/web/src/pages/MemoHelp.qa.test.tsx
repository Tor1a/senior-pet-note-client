// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMO_MAX_LENGTH } from '../lib/constants';
import type { Pet, TodayResponse } from '../lib/petApi';
import { PRIVACY_TEXT } from '../lib/privacyText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import PetFormPage from './PetFormPage';
import TodayPage from './TodayPage';

// QA 보강: aria-describedby 가 가리키는 요소가 실제로 있고(깨진 참조 없음), 글자 수 표시와 같이 그려지며, id 가 중복되지 않는다.

vi.mock('../auth', () => ({ useAuth: () => ({ logout: vi.fn(async () => {}) }) }));

const PET: Pet = {
  id: 'pet-1', name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전', hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const TODAY: TodayResponse = {
  recordDate: '2026-10-06', cutoffNotice: 'x', doses: [], dailyLog: null,
  suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 }, lastWeight: null,
};

beforeEach(() => {
  setToken('t');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    new URL(String(input)).pathname === '/api/pets/pet-1/today'
      ? new Response(JSON.stringify(TODAY), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function renderToday() {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <TodayPage />
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

describe('웹 메모 도움말 — QA 보강', () => {
  it('오늘 메모: describedby 가 가리키는 id 가 문서에 정확히 하나 있고 글자 수 표시와 함께 보인다', async () => {
    renderToday();
    const memo = await screen.findByRole('textbox', { name: '메모 (선택)' });
    const id = memo.getAttribute('aria-describedby')!;
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
    expect(document.getElementById(id)!.textContent).toBe(PRIVACY_TEXT.memoHelp);
    expect(screen.getByText(`0 / ${MEMO_MAX_LENGTH}`)).toBeTruthy();
    await userEvent.type(memo, '밥 잘 먹음');
    expect(screen.getByText(`6 / ${MEMO_MAX_LENGTH}`)).toBeTruthy();
    expect(screen.getByText(PRIVACY_TEXT.memoHelp)).toBeTruthy(); // 입력 중에도 사라지지 않음
  });

  it('오늘 화면에 도움말은 한 번만 나온다 (메모 칸 하나)', async () => {
    renderToday();
    await screen.findByRole('textbox', { name: '메모 (선택)' });
    expect(screen.getAllByText(PRIVACY_TEXT.memoHelp)).toHaveLength(1);
  });

  it.each(['new', 'edit'] as const)('질환 칸(%s): describedby 대상이 실제로 있고, 입력해도 남아 있다', async (mode) => {
    render(
      <MemoryRouter>
        <PetContext.Provider value={{ status: mode === 'new' ? 'none' : 'ready', pet: mode === 'new' ? null : PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
          <PetFormPage mode={mode} />
        </PetContext.Provider>
      </MemoryRouter>,
    );
    const input = screen.getByLabelText('앓고 있는 질환 (선택)');
    const id = input.getAttribute('aria-describedby')!;
    expect(id).toBeTruthy();
    expect(document.getElementById(id)?.textContent).toBe(PRIVACY_TEXT.memoHelp);
    await userEvent.type(input, ' 추가');
    expect(screen.getAllByText(PRIVACY_TEXT.memoHelp)).toHaveLength(1);
    // 같은 화면에서 id 가 중복되지 않는다
    const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
