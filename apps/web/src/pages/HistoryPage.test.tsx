// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCLAIMER } from '../lib/constants';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { findForbidden } from '../lib/historyText';
import type { HistoryResponse, Pet } from '../lib/petApi';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import HistoryDayPage from './HistoryDayPage';
import HistoryPage from './HistoryPage';

// 지난 기록 화면(H1/H2). 서버 없이 fetch 를 가짜로 바꾸고, 응답은 계약서(api-history.md) 모양을 쓴다.

const PET: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2012,
  conditions: null,
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const END = '2026-10-08';

/** 30일: 체중 일부만(4일 간격 포함), 증상 2일, 약 있음 */
function fullHistory(): HistoryResponse {
  return historyFixture(
    daysFixture(
      END,
      30,
      {
        '2026-10-02': { weightKg: 4.4, foodLevel: 2, waterMl: 300, symptoms: ['vomit'] },
        '2026-10-03': { weightKg: 4.4, symptoms: ['cough', 'other'], symptomOther: '절뚝', memo: '비밀 메모' },
        '2026-10-04': { symptomsNone: true },
        '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
        '2026-09-10': { weightKg: 4.6, waterLevel: 1 },
      },
      {},
      { scheduledCount: 3, takenCount: 2 },
    ),
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch(handler: (url: URL) => Response | Promise<Response>) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.pathname + url.search);
      return handler(url);
    }),
  );
  return urls;
}

function renderAt(path: string, reload = vi.fn(async () => {})) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload, setPet: vi.fn() }}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:recordDate" element={<HistoryDayPage />} />
          <Route path="/today" element={<p>오늘 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
  return reload;
}

/** 화면에 보이는 글에서 금지 표현이 없는지 (메모는 사용자 입력이라 제외) */
function expectNoForbidden() {
  const text = (document.body.textContent ?? '').replace('비밀 메모', '');
  expect({ text, hit: findForbidden(text) }).toEqual({ text, hit: null });
}

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('H1 지난 기록', () => {
  it('파라미터 없이 한 번 호출하고, 30일 기본 → 7일 전환은 재요청 없이 자른다', async () => {
    const urls = mockFetch(() => json(200, fullHistory()));
    renderAt('/history');

    expect(await screen.findByText(/기록한 날 5일 \/ 30일/)).toBeTruthy();
    expect(urls).toEqual(['/api/pets/pet-1/daily-logs']);
    expect(screen.getByRole('radio', { name: '30일 ✓' }).getAttribute('aria-checked')).toBe('true');

    await userEvent.click(screen.getByRole('radio', { name: '7일' }));
    expect(screen.getByText('10월 2일 ~ 10월 8일 · 기록한 날 4일 / 7일')).toBeTruthy();
    expect(screen.getByText('7일 보기로 바꿨어요')).toBeTruthy();
    expect(urls).toHaveLength(1);
    expectNoForbidden();
  });

  it('체중 사실 문장·증상 날(◆)·투약 문구, 퍼센트 없음', async () => {
    mockFetch(() => json(200, fullHistory()));
    renderAt('/history');
    await screen.findByText(/기록한 날/);

    expect(screen.getByText('이 기간 체중 기록 4번')).toBeTruthy();
    expect(screen.getByText(/마지막 체중 4.1kg \(10월 8일\) · 직전 7일 평균 4.4kg보다 0.3kg 적어요/)).toBeTruthy();
    expect(screen.getByText('◆ 10월 3일 (토) · 기침, 기타(절뚝)')).toBeTruthy();
    expect(screen.getByText('특이사항 없음으로 적은 날 1일')).toBeTruthy();
    expect(screen.getByText('먹임 체크 60회 / 예정 90회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요')).toBeTruthy();
    expect(screen.getByText('식사: 조금 0일 · 보통 1일 · 많이 1일 · 안 적은 날 28일')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);
    expect(screen.queryByText('비밀 메모')).toBeNull(); // 목록에는 메모를 보이지 않는다
  });

  it('그래프: 대체 텍스트와 점선 안내, ←/→ 키로 기록 이동', async () => {
    mockFetch(() => json(200, fullHistory()));
    renderAt('/history');
    await screen.findByText(/기록한 날/);

    const img = screen.getByRole('img', { name: /체중 그래프/ });
    expect(img.querySelector('desc')?.textContent).toBe(
      '지난 30일 체중 기록 4번. 첫 기록 4.6kg(9월 10일), 마지막 기록 4.1kg(10월 8일)',
    );
    expect(screen.getByText('측정하지 않은 날이 있어요', { exact: false })).toBeTruthy();

    const group = screen.getByRole('group', { name: /체중 그래프/ });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByText('10월 8일 (목) · 4.1kg')).toBeTruthy();
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByText('10월 3일 (토) · 4.4kg')).toBeTruthy();
    fireEvent.keyDown(group, { key: 'Home' });
    expect(screen.getByText('9월 10일 (목) · 4.6kg')).toBeTruthy();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByText('10월 2일 (금) · 4.4kg')).toBeTruthy();
  });

  it('표로 보기 토글: 표(caption)가 나오고 다시 누르면 그래프', async () => {
    mockFetch(() => json(200, fullHistory()));
    renderAt('/history');
    await screen.findByText(/기록한 날/);

    const toggle = screen.getByRole('button', { name: '표로 보기' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(toggle);
    const table = screen.getByRole('table');
    expect(within(table).getByText('날짜별 체중과 증상')).toBeTruthy();
    expect(within(table).getByText('◆ 기침, 기타(절뚝)')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /체중 그래프/ })).toBeNull();
    expect(screen.getByRole('button', { name: '그래프로 보기' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('날짜 줄: 기록 없음, 오늘 표기, H2 링크', async () => {
    mockFetch(() => json(200, fullHistory()));
    renderAt('/history');
    await screen.findByText(/기록한 날/);

    const today = screen.getByRole('link', { name: /10월 8일 \(목\) · 오늘 · 기록 중/ });
    expect(today.getAttribute('href')).toBe('/history/2026-10-08');
    const empty = screen.getByRole('link', { name: /10월 7일 \(수\)기록 없음/ });
    expect(empty.textContent).toContain('기록 없음');
  });

  it('기록 0일: 전체 빈 상태와 오늘 링크, 그래프·카드 없음', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 30))));
    renderAt('/history');

    expect(await screen.findByText('이 기간에는 기록이 없어요.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '오늘 기록하러 가기' }).getAttribute('href')).toBe('/today');
    expect(screen.queryByText('체중')).toBeNull();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expectNoForbidden();
  });

  it('체중 0번 / 1번 / 기록 1~2일 안내', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 30, { [END]: { foodLevel: 2 } }))));
    renderAt('/history');
    expect(await screen.findByText('체중을 적으면 여기에 그래프가 그려져요.', { exact: false })).toBeTruthy();
    expect(screen.getByText('기록이 쌓이면 흐름을 더 볼 수 있어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '표로 보기' })).toBeNull();
    cleanup();

    mockFetch(() => json(200, historyFixture(daysFixture(END, 30, { [END]: { weightKg: 4.2 } }))));
    renderAt('/history');
    expect(await screen.findByText('한 번 더 적으면 선이 이어져요.')).toBeTruthy();
    expect(screen.getByRole('img', { name: /체중 그래프/ })).toBeTruthy();
    expect(screen.queryByText(/마지막 체중/)).toBeNull();
    expectNoForbidden();
  });

  it('약이 없으면 투약 카드를 숨긴다', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 30, { [END]: { weightKg: 4.2 } }))));
    renderAt('/history');
    await screen.findByText(/기록한 날/);
    expect(screen.queryByText('투약 체크')).toBeNull();
    expect(screen.queryByText('현재 등록된 약 기준이에요')).toBeNull();
  });

  it('오류: 네트워크 문구와 다시 불러오기, 면책은 오류 중에도 보인다', async () => {
    let fail = true;
    const urls = mockFetch(() => {
      if (fail) throw new TypeError('Failed to fetch');
      return json(200, fullHistory());
    });
    renderAt('/history');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText(/기록한 날 5일/)).toBeTruthy();
    expect(urls).toHaveLength(2);
  });

  it('서버 오류는 한국어 안내, 404 는 반려동물 다시 확인', async () => {
    mockFetch(() => json(500, { code: 'INTERNAL', message: 'x' }));
    renderAt('/history');
    expect(await screen.findByText('지난 기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.')).toBeTruthy();
    cleanup();

    mockFetch(() => json(404, { code: 'NOT_FOUND', message: 'x' }));
    const reload = renderAt('/history');
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('로딩 중에도 면책이 보인다', () => {
    mockFetch(() => new Promise<Response>(() => {}));
    renderAt('/history');
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });
});

describe('H2 하루 상세', () => {
  it('from=to 로 호출하고 읽기 전용 값·메모·투약을 보여 준다', async () => {
    const day = daysFixture(
      '2026-10-03',
      1,
      { '2026-10-03': { weightKg: 4.4, foodLevel: 2, symptoms: ['other'], symptomOther: '절뚝', memo: '밥을 잘 먹음\n산책함' } },
      { '2026-10-03': { scheduledCount: 3, takenCount: 3 } },
    );
    const urls = mockFetch(() => json(200, historyFixture(day, { recordDate: END })));
    renderAt('/history/2026-10-03');

    expect(await screen.findByText('4.4kg')).toBeTruthy();
    expect(urls).toEqual(['/api/pets/pet-1/daily-logs?from=2026-10-03&to=2026-10-03']);
    expect(screen.getByRole('heading', { name: '10월 3일 (토)' })).toBeTruthy();
    expect(screen.getByText('◆ 기타(절뚝)')).toBeTruthy();
    expect(screen.getByText('적지 않았어요')).toBeTruthy(); // 물
    expect(screen.getByText(/밥을 잘 먹음/)).toBeTruthy();
    expect(screen.getByText('먹임 체크 3회 / 예정 3회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('link', { name: '← 전날' }).getAttribute('href')).toBe('/history/2026-10-02');
    expect(screen.getByRole('link', { name: '다음 날 →' }).getAttribute('href')).toBe('/history/2026-10-04');
  });

  it('기록 없는 날 / 오늘이면 다음 날 비활성 + 오늘 화면 링크', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 1), { recordDate: END })));
    renderAt(`/history/${END}`);
    expect(await screen.findByText('이 날은 기록이 없어요.')).toBeTruthy();
    expect(screen.getByText('아직 기록 중인 날이에요.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '오늘 화면에서 기록하기' }).getAttribute('href')).toBe('/today');
    expect(screen.queryByRole('link', { name: '다음 날 →' })).toBeNull();
    expect(screen.getByText('다음 날 →').getAttribute('aria-disabled')).toBe('true');
    expectNoForbidden();
  });

  it('오늘이라도 기록이 있으면 "기록 중" 문구는 숨기고 버튼만 보인다', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 1, { [END]: { weightKg: 4.2 } }), { recordDate: END })));
    renderAt(`/history/${END}`);
    expect(await screen.findByText('4.2kg')).toBeTruthy();
    expect(screen.queryByText('아직 기록 중인 날이에요.')).toBeNull();
    expect(screen.getByRole('link', { name: '오늘 화면에서 기록하기' })).toBeTruthy();
  });

  it('형식이 잘못된 주소는 H1 으로 보낸다', async () => {
    mockFetch(() => json(200, fullHistory()));
    renderAt('/history/abc');
    expect(await screen.findByRole('heading', { name: '지난 기록' })).toBeTruthy();
    cleanup();
    mockFetch(() => json(200, fullHistory()));
    renderAt('/history/2026-02-30');
    expect(await screen.findByRole('heading', { name: '지난 기록' })).toBeTruthy();
  });

  it('INVALID_DATE_RANGE 는 "이 날짜는 볼 수 없어요"', async () => {
    mockFetch(() => json(400, { code: 'INVALID_DATE_RANGE', message: '미래 날짜예요.' }));
    renderAt('/history/2030-01-01');
    expect(await screen.findByText('이 날짜는 볼 수 없어요.')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });
});
