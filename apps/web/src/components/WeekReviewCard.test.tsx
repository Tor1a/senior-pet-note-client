// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '../lib/api';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { findWeekReviewForbidden } from '../lib/weekReviewText';
import { setToken } from '../lib/tokenStorage';
import WeekReviewCard from './WeekReviewCard';

const END = '2026-10-08';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function normalHistory() {
  return historyFixture(
    daysFixture(
      END,
      30,
      {
        '2026-10-02': { weightKg: 4.4, memo: '비밀 메모', symptoms: ['vomit'] },
        '2026-10-04': { foodLevel: 2 },
        '2026-10-06': { weightKg: 4.3 },
        '2026-10-08': { weightKg: 4.1 },
      },
      {},
      { scheduledCount: 2, takenCount: 1 },
    ),
  );
}

let urls: string[];
function mockFetch(handler: () => Response | Promise<Response>) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.pathname + url.search);
      return handler();
    }),
  );
}

const toggle = () => screen.getByRole('button', { name: '최근 7일 돌아보기' });
const renderCard = (onNotFound = vi.fn()) => {
  render(<WeekReviewCard petId="pet-1" onNotFound={onNotFound} />);
  return { onNotFound };
};

beforeEach(() => {
  setToken('test-token');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WeekReviewCard', () => {
  it('기본 접힘: 요청 0, aria-expanded=false, 본문 hidden', () => {
    mockFetch(() => json(200, normalHistory()));
    renderCard();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toContain('펼치기');
    expect(document.getElementById('week-review-body')?.hasAttribute('hidden')).toBe(true);
    expect(urls).toEqual([]);
  });

  it('펼치면 인자 없이 1회 요청하고 로딩 뒤 사실 줄을 보인다', async () => {
    mockFetch(() => json(200, normalHistory()));
    renderCard();
    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toContain('접기');
    expect(await screen.findByText('기록한 날 4일 / 7일')).toBeTruthy();
    expect(urls).toEqual(['/api/pets/pet-1/daily-logs']);
    expect(screen.getByText('10월 2일 ~ 10월 8일')).toBeTruthy();
    expect(screen.getByText('체중 기록 3번')).toBeTruthy();
    expect(screen.getByText('첫 기록 4.4kg (10월 2일)')).toBeTruthy();
    expect(screen.getByText('마지막 4.1kg (10월 8일)')).toBeTruthy();
    expect(screen.getByText('투약 체크 7/14회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요. 체크하지 않은 날도 약을 먹였을 수 있어요.')).toBeTruthy();
    // 낭독 보조 문구
    expect(screen.getByText('10월 2일부터 10월 8일까지')).toBeTruthy();
    expect(screen.getByText('기록한 날 7일 중 4일')).toBeTruthy();
    expect(screen.getByText('투약 체크 14회 중 7회')).toBeTruthy();
    // 메모·증상은 나오지 않는다
    expect(screen.queryByText(/비밀 메모|구토/)).toBeNull();
  });

  it('로딩 중에는 불러오는 중… 과 aria-busy', async () => {
    let release: (r: Response) => void = () => {};
    mockFetch(() => new Promise<Response>((r) => (release = r)));
    renderCard();
    await userEvent.click(toggle());
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.getByText('불러오는 중…').parentElement?.getAttribute('aria-busy')).toBe('true');
    release(json(200, normalHistory()));
    await screen.findByText('기록한 날 4일 / 7일');
  });

  it('사실 영역은 aria-live=polite 이고 처음부터 DOM 에 있다', () => {
    mockFetch(() => json(200, normalHistory()));
    renderCard();
    const live = document.querySelector('#week-review-body [aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe('');
  });

  it('접었다 다시 펼치면 다시 요청하고 이전 숫자를 지운다', async () => {
    let hold = false;
    let release: () => void = () => {};
    mockFetch(async () => {
      if (hold) await new Promise<void>((r) => (release = r));
      return json(200, normalHistory());
    });
    renderCard();
    await userEvent.click(toggle());
    await screen.findByText('기록한 날 4일 / 7일');
    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('기록한 날 4일 / 7일')).toBeNull();
    hold = true;
    await userEvent.click(toggle());
    expect(screen.queryByText('기록한 날 4일 / 7일')).toBeNull();
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    release();
    await screen.findByText('기록한 날 4일 / 7일');
    expect(urls.length).toBe(2);
  });

  it('접힌 동안 도착한 응답은 버린다', async () => {
    let release: (r: Response) => void = () => {};
    mockFetch(() => new Promise<Response>((r) => (release = r)));
    renderCard();
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    release(json(200, normalHistory()));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('기록한 날 4일 / 7일')).toBeNull();
  });

  it('접고 바로 다시 펼칠 때 이전 응답이 먼저 오면 버리고 새 응답만 보인다', async () => {
    const releases: ((r: Response) => void)[] = [];
    mockFetch(() => new Promise<Response>((r) => releases.push(r)));
    renderCard();
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(releases.length).toBe(2);
    // 이전(첫 번째) 요청 응답이 먼저 도착: 무시되어 로딩이 유지된다
    releases[0](json(200, historyFixture(daysFixture(END, 30, { '2026-10-08': { foodLevel: 2 } }))));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('기록한 날 1일 / 7일')).toBeNull();
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    releases[1](json(200, normalHistory()));
    expect(await screen.findByText('기록한 날 4일 / 7일')).toBeTruthy();
    expect(screen.queryByText('기록한 날 1일 / 7일')).toBeNull();
  });

  it('기록 0일: 기간 + 안내 한 줄, 권유·체중·투약 없음', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 30, { '2026-09-10': { weightKg: 4.5 } }, {}, { scheduledCount: 2, takenCount: 2 }))));
    renderCard();
    await userEvent.click(toggle());
    expect(await screen.findByText('최근 7일에는 적은 기록이 없어요.')).toBeTruthy();
    expect(screen.getByText('10월 2일 ~ 10월 8일')).toBeTruthy();
    expect(screen.queryByText(/체중|투약|기록한 날|적어 보세요/)).toBeNull();
  });

  it('1~2일: 사실 줄만, 안내·위로 문구 없음. 체중 1번은 한 줄', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 30, { '2026-10-08': { weightKg: 4.1 } }))));
    renderCard();
    await userEvent.click(toggle());
    expect(await screen.findByText('기록한 날 1일 / 7일')).toBeTruthy();
    expect(screen.getByText('체중 기록 1번')).toBeTruthy();
    expect(screen.getByText('4.1kg (10월 8일)')).toBeTruthy();
    expect(screen.queryByText(/첫 기록|마지막|투약|쌓이면/)).toBeNull();
  });

  it('체중 0번·예정 0이면 체중·투약 줄과 고지가 없다', async () => {
    mockFetch(() => json(200, historyFixture(daysFixture(END, 30, { '2026-10-08': { foodLevel: 2 } }))));
    renderCard();
    await userEvent.click(toggle());
    await screen.findByText('기록한 날 1일 / 7일');
    expect(screen.queryByText(/체중|투약|약 기준/)).toBeNull();
  });

  it('화면에 보이는 모든 글자에 금지어가 없다', async () => {
    mockFetch(() => json(200, normalHistory()));
    renderCard();
    await userEvent.click(toggle());
    await screen.findByText('기록한 날 4일 / 7일');
    const body = document.getElementById('week-review-body')!;
    expect(findWeekReviewForbidden(body.textContent ?? '')).toBeNull();
    expect(body.textContent).not.toMatch(/%|달성|연속|일째|평균/);
  });

  it('네트워크 오류: 안내 + 다시 불러오기, 오류는 aria-live 밖, 재시도 뒤 포커스는 토글', async () => {
    let fail = true;
    mockFetch(() => {
      if (fail) throw new TypeError('Failed to fetch');
      return json(200, normalHistory());
    });
    renderCard();
    await userEvent.click(toggle());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(NETWORK_ERROR_MESSAGE);
    expect(alert.closest('[aria-live]')).toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByText('기록한 날 4일 / 7일');
    expect(document.activeElement).toBe(toggle());
    expect(urls.length).toBe(2);
  });

  it('loadFailed 오류에서도 다시 불러오기 뒤 포커스는 토글로 돌아온다', async () => {
    let fail = true;
    mockFetch(() => (fail ? json(500, { code: 'X', message: 'x' }) : json(200, normalHistory())));
    renderCard();
    await userEvent.click(toggle());
    const retry = await screen.findByRole('button', { name: '다시 불러오기' });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    fail = false;
    await userEvent.click(retry);
    await screen.findByText('기록한 날 4일 / 7일');
    expect(document.activeElement).toBe(toggle());
  });

  it('그 외 오류는 loadFailed 문구', async () => {
    mockFetch(() => json(500, { code: 'X', message: 'x' }));
    renderCard();
    await userEvent.click(toggle());
    expect((await screen.findByRole('alert')).textContent).toBe('지난 기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.');
  });

  it('404 면 onNotFound 를 부르고 접는다', async () => {
    mockFetch(() => json(404, { code: 'NOT_FOUND', message: 'x' }));
    const { onNotFound } = renderCard();
    await userEvent.click(toggle());
    await waitFor(() => expect(onNotFound).toHaveBeenCalledTimes(1));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('저장 키를 만들지 않는다(localStorage 에 spn.token 외 변화 없음)', async () => {
    mockFetch(() => json(200, normalHistory()));
    renderCard();
    const before = Object.keys(localStorage).sort();
    await userEvent.click(toggle());
    await screen.findByText('기록한 날 4일 / 7일');
    await userEvent.click(toggle());
    expect(Object.keys(localStorage).sort()).toEqual(before);
  });
});
