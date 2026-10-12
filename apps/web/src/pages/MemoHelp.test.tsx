// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pet, TodayResponse } from '../lib/petApi';
import { findPrivacyForbidden, PRIVACY_TEXT } from '../lib/privacyText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import PetFormPage from './PetFormPage';
import TodayPage from './TodayPage';

// 메모 입력칸(오늘 메모, 반려동물 질환 메모) 아래에 보호자 건강 정보 안내가 항상 보이고 입력칸과 연결되는지 본다.

vi.mock('../auth', () => ({ useAuth: () => ({ logout: vi.fn(async () => {}) }) }));

const PET: Pet = {
  id: 'pet-1',
  name: '보리',
  species: 'dog',
  birthYear: 2012,
  conditions: '신부전',
  hasPhoto: false,
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

beforeEach(() => {
  setToken('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/pets/pet-1/today') {
        return new Response(JSON.stringify(TODAY), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('메모 입력칸 안내 문구', () => {
  it('문구에 금지 표현이 없다', () => {
    expect(findPrivacyForbidden(PRIVACY_TEXT.memoHelp)).toBeNull();
  });

  it('오늘 메모: placeholder 가 아니라 보이는 문구이고 aria-describedby 로 입력칸과 연결된다', async () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
          <TodayPage />
        </PetContext.Provider>
      </MemoryRouter>,
    );
    const memo = await screen.findByRole('textbox', { name: '메모 (선택)' });
    const help = screen.getByText(PRIVACY_TEXT.memoHelp);
    expect(help.id).toBe('memo-help');
    expect(memo.getAttribute('aria-describedby')).toBe('memo-help');
    expect(memo.getAttribute('placeholder')).not.toContain('보호자');
  });

  it.each(['new', 'edit'] as const)('반려동물 폼(%s): 질환 입력칸과 연결된 도움말이 보인다', (mode) => {
    render(
      <MemoryRouter initialEntries={[mode === 'new' ? '/pets/new' : '/pet']}>
        <PetContext.Provider
          value={{
            status: mode === 'new' ? 'none' : 'ready',
            pet: mode === 'new' ? null : PET,
            reload: vi.fn(async () => {}),
            setPet: vi.fn(),
          }}
        >
          <PetFormPage mode={mode} />
        </PetContext.Provider>
      </MemoryRouter>,
    );
    const input = screen.getByLabelText('앓고 있는 질환 (선택)');
    const help = screen.getByText(PRIVACY_TEXT.memoHelp);
    expect(input.getAttribute('aria-describedby')).toBe(help.id);
  });
});
