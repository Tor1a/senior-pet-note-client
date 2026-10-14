// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKLIST_TEXT } from '../lib/checklistText';
import { DISCLAIMER } from '../lib/constants';
import { clearLocalAppData } from '../lib/localData';
import type { Pet, TodayResponse } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import ChecklistPage from './ChecklistPage';
import TodayPage from './TodayPage';

// 처음 키워요 체크리스트 화면과 오늘 화면 진입 카드 (온보딩 F단계). 네트워크 호출 0.

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
    if (url.pathname === '/api/pets/pet-1/today') {
      return new Response(JSON.stringify(TODAY), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderAt(path: string, pet: Pet | null = PET, status: 'ready' | 'loading' = 'ready') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status, pet, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

describe('/checklist 화면', () => {
  it('기본은 준비물 탭, 고정 문구·저장 안내·면책이 보이고 진행률 문구가 없다', () => {
    renderAt('/checklist');
    expect(screen.getByRole('tab', { name: '준비물' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '병원에 물어볼 질문' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText(CHECKLIST_TEXT.notice)).toBeTruthy();
    expect(screen.getByText(CHECKLIST_TEXT.saveNote)).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(CHECKLIST_TEXT.title);
    expect(screen.queryByText(/\d+\s*\/\s*\d+|완료|달성/)).toBeNull();
    expect(document.querySelector('[aria-live]')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
  });

  it('탭 전환: 질문 탭에는 질문만, 개 항목만 보인다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist');
    expect(screen.getByRole('checkbox', { name: '목줄·하네스' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '스크래처' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: '병원에 물어볼 질문' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByRole('checkbox', { name: '산책은 어떻게 시작하면 되나요?' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '물그릇' })).toBeNull();
  });

  it('방향키로 탭을 옮긴다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist');
    screen.getByRole('tab', { name: '준비물' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '병원에 물어볼 질문' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: '준비물' }).getAttribute('aria-selected')).toBe('true');
  });

  it('탭 roving tabIndex, 방향키(왼쪽)·End 로 이동하고 포커스도 따라간다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist');
    const prep = screen.getByRole('tab', { name: '준비물' });
    const ask = screen.getByRole('tab', { name: '병원에 물어볼 질문' });
    expect(prep.getAttribute('tabindex')).toBe('0');
    expect(ask.getAttribute('tabindex')).toBe('-1');
    prep.focus();
    await user.keyboard('{End}');
    expect(ask.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(ask);
    expect(ask.getAttribute('tabindex')).toBe('0');
    expect(prep.getAttribute('tabindex')).toBe('-1');
    await user.keyboard('{ArrowLeft}');
    expect(prep.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(prep);
    await user.keyboard('{ArrowLeft}'); // 처음에서 왼쪽은 마지막으로 순환
    expect(ask.getAttribute('aria-selected')).toBe('true');
  });

  it('체크박스는 Space 로 토글된다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist');
    const box = screen.getByRole('checkbox', { name: '물그릇' }) as HTMLInputElement;
    box.focus();
    await user.keyboard(' ');
    expect(box.checked).toBe(true);
    await user.keyboard(' ');
    expect(box.checked).toBe(false);
  });

  it('두 탭 시나리오: 다른 탭에서 바뀐 같은 반려동물 체크가 사라지지 않는다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist'); // 이 탭은 마운트 시점에 빈 상태
    localStorage.setItem('spn.checklist', JSON.stringify({ v: 1, p: { 'pet-1': ['prep.toy'], 'pet-2': ['prep.bed'] } })); // 다른 탭이 저장
    await user.click(screen.getByText('물그릇'));
    const saved = JSON.parse(localStorage.getItem('spn.checklist')!);
    expect(saved.p['pet-1'].sort()).toEqual(['prep.toy', 'prep.water_bowl']);
    expect(saved.p['pet-2']).toEqual(['prep.bed']);
  });

  it('저장소를 읽지 못해도 화면의 이전 체크는 유지된다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist');
    await user.click(screen.getByText('물그릇'));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await user.click(screen.getByText('장난감'));
    expect((screen.getByRole('checkbox', { name: '물그릇' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: '장난감' }) as HTMLInputElement).checked).toBe(true);
    vi.restoreAllMocks();
  });

  it('고양이는 고양이 항목만 보인다', () => {
    renderAt('/checklist', { ...PET, species: 'cat' });
    expect(screen.getByRole('checkbox', { name: '스크래처' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '목줄·하네스' })).toBeNull();
  });

  it('체크하면 상태 글자가 바뀌고 자리는 그대로이며, 다시 열어도 유지된다', async () => {
    const user = userEvent.setup();
    const first = renderAt('/checklist');
    const box = screen.getByRole('checkbox', { name: '물그릇' }) as HTMLInputElement;
    const row = box.closest('li')!;
    expect(within(row).getByText('체크 안 함')).toBeTruthy();
    const before = screen.getAllByRole('checkbox').map((c) => c.closest('li')!.textContent!.replace(/체크( 안)? ?함/, ''));
    await user.click(screen.getByText('물그릇')); // 행 전체(글자)를 눌러도 토글된다
    expect(box.checked).toBe(true);
    expect(within(row).getByText('체크함')).toBeTruthy();
    const after = screen.getAllByRole('checkbox').map((c) => c.closest('li')!.textContent!.replace(/체크( 안)? ?함/, ''));
    expect(after).toEqual(before);
    expect(JSON.parse(localStorage.getItem('spn.checklist')!)).toEqual({ v: 1, p: { 'pet-1': ['prep.water_bowl'] } });

    first.unmount();
    renderAt('/checklist');
    expect((screen.getByRole('checkbox', { name: '물그릇' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByText('물그릇'));
    expect((screen.getByRole('checkbox', { name: '물그릇' }) as HTMLInputElement).checked).toBe(false);
  });

  it('반려동물 id 별로 분리된다', () => {
    localStorage.setItem('spn.checklist', JSON.stringify({ v: 1, p: { 'pet-2': ['prep.toy'] } }));
    renderAt('/checklist');
    expect((screen.getByRole('checkbox', { name: '장난감' }) as HTMLInputElement).checked).toBe(false);
  });

  it('손상된 저장 값이면 모두 체크 안 함으로 열린다', () => {
    localStorage.setItem('spn.checklist', '{깨짐');
    renderAt('/checklist');
    expect(screen.getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(true);
  });

  it('저장소가 막혀도 화면은 동작하고 네트워크 호출은 없다', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderAt('/checklist');
    await user.click(screen.getByText('이동장'));
    expect((screen.getByRole('checkbox', { name: '이동장' }) as HTMLInputElement).checked).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('체크한 뒤 clearLocalAppData(탈퇴 정리)를 부르면 체크 목록이 지워진다', async () => {
    const user = userEvent.setup();
    renderAt('/checklist');
    await user.click(screen.getByText('이동장'));
    expect(localStorage.getItem('spn.checklist')).not.toBeNull();
    clearLocalAppData();
    expect(localStorage.getItem('spn.checklist')).toBeNull();
  });
});

describe('오늘 화면 진입 카드', () => {
  it('first_time 에게만 카드가 있고 누르면 /checklist 로 간다', async () => {
    const user = userEvent.setup();
    renderAt('/today');
    const link = await screen.findByRole('link', { name: CHECKLIST_TEXT.entryButtonLabel });
    expect(link.textContent).toBe('열기');
    expect(link.getAttribute('href')).toBe('/checklist');
    const card = link.closest('section')!;
    expect(card.nextElementSibling).toBe(screen.getByText(DISCLAIMER));
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: CHECKLIST_TEXT.title })).toBeTruthy();
  });

  it.each([
    ['senior', { ...PET, profileType: 'senior' as const }],
    ['null', { ...PET, profileType: null }],
    ['없음', { ...PET, profileType: undefined }],
  ])('profileType %s 에는 카드 DOM 이 없다', async (_n, pet) => {
    renderAt('/today', pet);
    await screen.findByText(DISCLAIMER);
    expect(screen.queryByText(CHECKLIST_TEXT.title)).toBeNull();
    expect(document.getElementById('checklist-entry-title')).toBeNull();
    expect(screen.queryByRole('link', { name: CHECKLIST_TEXT.entryButtonLabel })).toBeNull();
  });

  it('first_time 에서 senior 로 바뀌면 카드가 바로 사라진다', async () => {
    const ctx = (pet: Pet) => (
      <MemoryRouter initialEntries={['/today']}>
        <PetContext.Provider value={{ status: 'ready', pet, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
          <Routes>
            <Route path="/today" element={<TodayPage />} />
          </Routes>
        </PetContext.Provider>
      </MemoryRouter>
    );
    const view = render(ctx(PET));
    expect(await screen.findByRole('link', { name: CHECKLIST_TEXT.entryButtonLabel })).toBeTruthy();
    view.rerender(ctx({ ...PET, profileType: 'senior' }));
    expect(screen.queryByRole('link', { name: CHECKLIST_TEXT.entryButtonLabel })).toBeNull();
    expect(document.getElementById('checklist-entry-title')).toBeNull();
  });

  it('pet 이 null 이면 카드가 없다', () => {
    renderAt('/today', null, 'loading');
    expect(screen.queryByText(CHECKLIST_TEXT.title)).toBeNull();
  });
});
