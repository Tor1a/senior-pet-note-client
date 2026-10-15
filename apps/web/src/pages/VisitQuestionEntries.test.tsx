// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCLAIMER } from '../lib/constants';
import type { Pet, TodayResponse } from '../lib/petApi';
import { todoListExample } from '../lib/todoFixtures';
import { setToken } from '../lib/tokenStorage';
import { findVisitQuestionForbidden, VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { PetContext } from '../pet';
import ChecklistPage from './ChecklistPage';
import TodayPage from './TodayPage';
import { json, mockServer, renderTodos } from './todoTestKit';

// 진료 때 물어볼 것 진입점 3곳(오늘 화면 / 할 일 목록 / first_time 체크리스트 질문 탭). 리포트 옵션은 ReportPage.questions.test.tsx.

vi.mock('../auth', () => ({ useAuth: () => ({ logout: vi.fn(async () => {}) }) }));

const PET: Pet = {
  id: 'pet-1',
  name: '보리',
  species: 'dog',
  birthYear: 2012,
  conditions: null,
  hasPhoto: false,
  profileType: 'first_time',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const TODAY: TodayResponse = {
  recordDate: '2026-10-06',
  cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요',
  doses: [],
  dailyLog: null,
  suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 },
  lastWeight: null,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setToken('test-token');
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/pets/pet-1/today') return json(200, TODAY);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderToday(pet: Pet = PET) {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <PetContext.Provider value={{ status: 'ready', pet, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/visit-questions" element={<p>물어볼 것 화면</p>} />
          <Route path="/checklist" element={<ChecklistPage />} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

describe('E1 오늘 화면 링크 행', () => {
  it('할 일 카드 바로 아래, 체크리스트 카드 위에 있고 이름은 진료 때 물어볼 것. 개수·배지가 없다', async () => {
    renderToday();
    const link = await screen.findByRole('link', { name: T.title });
    expect(link.getAttribute('href')).toBe('/visit-questions');
    expect(link.className).toContain('history-link-row');
    expect(link.textContent).toBe('진료 때 물어볼 것›');
    expect(link.previousElementSibling?.querySelector('#todo-entry-title')).toBeTruthy();
    // first_time: 다음은 체크리스트 진입 카드
    expect(link.nextElementSibling?.tagName).toBe('SECTION');
    expect(findVisitQuestionForbidden(link.textContent ?? '')).toBeNull();
  });

  it('first_time 이 아니어도 같은 자리(할 일 카드 -> 링크 -> 면책)', async () => {
    renderToday({ ...PET, profileType: 'senior' });
    const link = await screen.findByRole('link', { name: T.title });
    expect(link.previousElementSibling?.querySelector('#todo-entry-title')).toBeTruthy();
    expect(link.nextElementSibling).toBe(screen.getByText(DISCLAIMER));
  });

  it('오늘 화면은 질문 API 를 호출하지 않는다', async () => {
    renderToday();
    await screen.findByRole('link', { name: T.title });
    await new Promise((r) => setTimeout(r, 20));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('visit-questions'))).toBe(false);
  });

  it('누르면 /visit-questions 로 간다', async () => {
    renderToday();
    await userEvent.setup().click(await screen.findByRole('link', { name: T.title }));
    expect(await screen.findByText('물어볼 것 화면')).toBeTruthy();
  });
});

describe('E2 할 일 목록 링크 행', () => {
  it('안내 바로 아래에 있고 목록이 비어 있어도 보인다. ?from=todos', async () => {
    mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])) });
    renderTodos('/todos');
    const link = await screen.findByRole('link', { name: T.title });
    expect(link.getAttribute('href')).toBe('/visit-questions?from=todos');
    expect(link.className).toContain('history-link-row');
    expect(link.previousElementSibling?.className).toBe('lead');
  });

  it('질문 API 를 부르지 않는다', async () => {
    const calls = mockServer({ 'GET /api/pets/pet-1/todos': () => json(200, todoListExample([])) });
    renderTodos('/todos');
    await screen.findByRole('link', { name: T.title });
    expect(calls.some((c) => c.path.includes('visit-questions'))).toBe(false);
  });
});

describe('E3 체크리스트 질문 탭 링크 행', () => {
  function renderChecklist() {
    render(
      <MemoryRouter initialEntries={['/checklist']}>
        <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
          <Routes>
            <Route path="/checklist" element={<ChecklistPage />} />
          </Routes>
        </PetContext.Provider>
      </MemoryRouter>,
    );
  }

  it('준비물 탭에는 없고 병원에 물어볼 질문 탭 목록 아래에만 있다. ?from=checklist, 네트워크 호출 0', async () => {
    const user = userEvent.setup();
    renderChecklist();
    expect(screen.queryByRole('link', { name: T.checklistTitle })).toBeNull();
    await user.click(screen.getByRole('tab', { name: '병원에 물어볼 질문' }));
    const link = screen.getByRole('link', { name: T.checklistTitle });
    expect(link.getAttribute('href')).toBe('/visit-questions?from=checklist');
    expect(link.textContent).toBe('내가 물어볼 것 적어 두기›');
    expect(link.previousElementSibling?.tagName).toBe('UL');
    expect(findVisitQuestionForbidden(link.textContent ?? '')).toBeNull();
    await user.click(screen.getByRole('tab', { name: '준비물' }));
    expect(screen.queryByRole('link', { name: T.checklistTitle })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
