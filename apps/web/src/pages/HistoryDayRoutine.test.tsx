// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { findRoutineForbidden } from '../lib/routineText';
import type { Pet } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import HistoryDayPage from './HistoryDayPage';

// 지난 기록 하루 상세의 산책·배변 한 줄 (읽기 전용, 값이 없으면 줄 숨김)
const PET: Pet = {
  id: 'pet-1', name: '초코', species: 'dog', birthYear: 2012, conditions: null, hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const DAY = '2026-10-08';

function renderDay(log: Record<string, unknown> | null) {
  const res = historyFixture(daysFixture(DAY, 1, log ? { [DAY]: log } : {}), { recordDate: DAY });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  render(
    <MemoryRouter initialEntries={[`/history/${DAY}`]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/history/:recordDate" element={<HistoryDayPage />} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('하루 상세의 산책·배변 한 줄', () => {
  it('값이 있으면 사실 한 줄을 증상 다음, 메모 앞에 보여 준다', async () => {
    renderDay({ weightKg: 4.1, walkCount: 2, poopCount: 3, memo: '잘 걸었어요' });
    const line = await screen.findByText('산책 2회 · 배변 3회');
    expect(line.tagName).toBe('DD');
    expect(line.previousElementSibling?.textContent).toBe('산책·배변');
    expect(findRoutineForbidden(line.textContent ?? '')).toBeNull();
    const dts = Array.from(document.querySelectorAll('dt')).map((e) => e.textContent);
    expect(dts).toEqual(['체중', '식사', '물', '증상', '산책·배변', '메모']);
  });

  it('0 은 숨기지 않고, 한쪽만 있으면 그쪽만 보인다', async () => {
    renderDay({ walkCount: 0, poopCount: null });
    expect(await screen.findByText('산책 0회')).toBeTruthy();
  });

  it('둘 다 없으면 줄 자체를 그리지 않는다', async () => {
    renderDay({ weightKg: 4.1, walkCount: null, poopCount: null });
    await screen.findByText('4.1kg');
    expect(screen.queryByText('산책·배변')).toBeNull();
  });
});
