// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCLAIMER } from '../lib/constants';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { medicationTotals, recordedDayCount } from '../lib/historyStats';
import type { HistoryResponse, Medication, Pet } from '../lib/petApi';
import { findReportForbidden } from '../lib/reportText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import HistoryPage from './HistoryPage';
import ReportPage from './ReportPage';

// 병원 방문 리포트 화면. 서버 없이 fetch 를 가짜로 바꾸고, 응답은 계약서(api-history.md) 모양을 쓴다.

const PET: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2014,
  conditions: '신장 관리 중',
  hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const MEDS: Medication[] = [
  { id: 'm1', petId: 'pet-1', name: '아조딜', doseText: '1캡슐', times: ['08:00', '20:00'], active: true },
];

const END = '2026-10-08';
const MEMO = '사료를 잘게 불려 줬어요.\n이상해 보여서 <b>메모</b>';

function history30(logs: Record<string, object> = {}): HistoryResponse {
  return historyFixture(
    daysFixture(
      END,
      30,
      {
        '2026-09-12': { weightKg: 4.8, memo: '14일 밖 메모' },
        '2026-09-26': { weightKg: 4.4, foodLevel: 2, waterMl: 300 },
        '2026-10-03': { weightKg: 4.0, symptoms: ['cough', 'other'], symptomOther: '절뚝', memo: MEMO },
        '2026-10-04': { symptomsNone: true },
        '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
        ...logs,
      } as never,
      {},
      { scheduledCount: 3, takenCount: 2 },
    ),
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch(handler: { history?: () => Response; meds?: () => Response }) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.pathname + url.search);
      if (url.pathname.endsWith('/medications')) return (handler.meds ?? (() => json(200, MEDS)))();
      return (handler.history ?? (() => json(200, history30())))();
    }),
  );
  return urls;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/report" element={<ReportPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/today" element={<p>오늘 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

/** 사용자 입력(이름·질환·약·메모·증상 기타)을 뺀 화면 글에서 금지 표현을 찾는다 */
function expectNoForbidden() {
  const text = (document.body.textContent ?? '')
    .replace(MEMO, '')
    .replace('이상해 보여서', '')
    .replace('신장 관리 중', '')
    .replace('14일 밖 메모', '');
  expect({ text, hit: findReportForbidden(text) }).toEqual({ text, hit: null });
}

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('R1 병원 방문 리포트', () => {
  it('daily-logs 1번 + 약 목록 1번만 부르고, 기본 14일이며 7/30 전환은 재요청이 없다', async () => {
    const urls = mockFetch({});
    renderAt('/report');

    expect(await screen.findByText('9월 25일 ~ 10월 8일 (14일)')).toBeTruthy();
    expect(urls.filter((u) => u.includes('daily-logs'))).toEqual(['/api/pets/pet-1/daily-logs']);
    expect(urls.filter((u) => u.includes('medications'))).toHaveLength(1);
    expect(screen.getByRole('radio', { name: '14일 ✓' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('14일 중 4일 기록했어요.')).toBeTruthy();

    await userEvent.click(screen.getByRole('radio', { name: '30일' }));
    expect(screen.getByText('9월 9일 ~ 10월 8일 (30일)')).toBeTruthy();
    expect(screen.getByText('14일 밖 메모')).toBeTruthy();
    expect(screen.getByText('30일 보기로 바꿨어요. 30일 중 5일 기록했어요.')).toBeTruthy();

    await userEvent.click(screen.getByRole('radio', { name: '7일' }));
    expect(screen.getByText('10월 2일 ~ 10월 8일 (7일)')).toBeTruthy();
    expect(screen.queryByText('14일 밖 메모')).toBeNull();
    expect(urls.filter((u) => u.includes('daily-logs'))).toHaveLength(1);
    expectNoForbidden();
  });

  it('본문: 기본 정보, 체중 네 값, 식사·물, 증상(기타 내용), 투약 고지, 약 목록, 메모, 기록 없는 날', async () => {
    mockFetch({});
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');

    expect(screen.getByText('초코 · 강아지 · 2014년생')).toBeTruthy();
    expect(screen.getByText('보호자가 적은 질환: 신장 관리 중')).toBeTruthy();
    expect(screen.getByText('기록 기준일: 10월 8일')).toBeTruthy();
    expect(screen.getByText('체중을 적은 날 3일')).toBeTruthy();
    expect(screen.getByText('첫 기록 4.4kg (9월 26일) · 마지막 기록 4.1kg (10월 8일)')).toBeTruthy();
    expect(screen.getByText('가장 낮은 기록 4kg (10월 3일) · 가장 높은 기록 4.4kg (9월 26일)')).toBeTruthy();
    expect(screen.getByText('식사: 조금 0일 · 보통 1일 · 많이 1일 · 안 적은 날 12일')).toBeTruthy();
    expect(screen.getByText('ml로 적은 날 평균 300ml (1일)')).toBeTruthy();
    expect(screen.getByText('기침, 기타(절뚝)')).toBeTruthy();
    expect(screen.getByText('특이사항 없음으로 적은 날 1일')).toBeTruthy();
    expect(screen.getByText('먹임 체크 28회 / 예정 42회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요.')).toBeTruthy();
    expect(screen.getByText('체크하지 않은 날도 약을 먹였을 수 있어요.')).toBeTruthy();
    expect(screen.getByText('아조딜 · 1캡슐')).toBeTruthy();
    expect(screen.getByText('세로축은 0kg부터 시작하지 않아요.')).toBeTruthy();
    expect(screen.getByText('기록 없는 날 10일')).toBeTruthy();
    expect(screen.getAllByText(DISCLAIMER).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/%/);
    // 그래프 대체 텍스트 + 표
    expect(screen.getByRole('img', { name: /체중 그래프/ }).querySelector('desc')?.textContent).toContain('체중 기록 3번');
    expect(screen.getByRole('table', { name: '초코 최근 14일 체중' })).toBeTruthy();
  });

  it('메모는 적은 그대로(줄바꿈 유지, HTML 이스케이프)이고, 끄면 사라진다', async () => {
    mockFetch({});
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');

    const memo = screen.getByText((_, el) => el?.tagName === 'DD' && el.textContent === MEMO);
    expect(memo.querySelector('b')).toBeNull();
    expect(memo.className).toContain('report-user-text');

    const toggle = screen.getByRole('switch', { name: /메모 포함/ });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText((_, el) => el?.tagName === 'DD' && el.textContent === MEMO)).toBeNull();
    expect(screen.getByText('메모는 담지 않았어요.')).toBeTruthy();
  });

  it('인쇄하기는 window.print 를 부르고 문서 제목을 파일명용으로 바꾼다', async () => {
    mockFetch({});
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const before = document.title;
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');

    expect(document.title).toBe('초코 진료용 기록 요약 10월 8일');
    const buttons = screen.getAllByRole('button', { name: '인쇄하기' });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PDF로 저장하면 이 기기에 파일이 남아요. 공용 컴퓨터에서는 저장하지 마세요.')).toBeTruthy();

    cleanup();
    expect(document.title).toBe(before);
  });

  it('기록 0일: 빈 상태, 인쇄 비활성 + 이유 글자, 면책 유지', async () => {
    mockFetch({ history: () => json(200, historyFixture(daysFixture(END, 30, {}))) });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderAt('/report');

    expect(await screen.findByText('이 기간에는 남긴 기록이 없어요.')).toBeTruthy();
    expect(screen.getByText('기록이 쌓이면 여기에 요약해 드려요.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '오늘 기록하러 가기' })).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: '인쇄하기' });
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('기록이 없어서 만들 수 없어요.')).toBeTruthy();
    expect(screen.getAllByText(DISCLAIMER).length).toBeGreaterThan(0);
    await userEvent.click(buttons[0]);
    expect(print).not.toHaveBeenCalled();
    expectNoForbidden();
  });

  it('기록 1일: 본문이 나오고 적힌 기록만 담았어요', async () => {
    mockFetch({ history: () => json(200, historyFixture(daysFixture(END, 30, { [END]: { weightKg: 4.2 } } as never))) });
    renderAt('/report');
    expect(await screen.findByText('적힌 기록만 담았어요.')).toBeTruthy();
    expect(screen.getByText('체중은 하루 적었어요. 10월 8일 4.2kg이에요.')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: '인쇄하기' })[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('로딩 중에는 인쇄 비활성 + 이유, 면책은 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    renderAt('/report');
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.getByText('불러온 뒤에 할 수 있어요.')).toBeTruthy();
    expect(screen.getAllByText(DISCLAIMER).length).toBeGreaterThan(0);
  });

  it('불러오기 실패: 오류 안내 + 다시 불러오기, 인쇄 비활성', async () => {
    let fail = true;
    mockFetch({ history: () => (fail ? json(500, { code: 'INTERNAL', message: 'x' }) : json(200, history30())) });
    renderAt('/report');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('리포트를 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.');
    expect((screen.getAllByRole('button', { name: '인쇄하기' })[0] as HTMLButtonElement).disabled).toBe(true);

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('9월 25일 ~ 10월 8일 (14일)')).toBeTruthy();
  });

  it('약 목록만 실패해도 나머지는 보이고, 오류 문구가 본문에 남는다', async () => {
    mockFetch({ meds: () => json(500, { code: 'INTERNAL', message: 'x' }) });
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    await waitFor(() => expect(screen.getByText('약 목록을 불러오지 못했어요.')).toBeTruthy());
    expect(screen.getByText('먹임 체크 28회 / 예정 42회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요.')).toBeTruthy();
  });

  it('약 목록을 불러오는 동안은 인쇄 버튼이 꺼지고 이유가 보인다', async () => {
    mockFetch({ meds: () => new Promise<Response>(() => {}) as never });
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    const buttons = screen.getAllByRole('button', { name: '인쇄하기' }) as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(screen.getByText('약 목록을 불러오는 중이에요. 불러온 뒤에 할 수 있어요.')).toBeTruthy();
  });

  it('약 목록 실패: 종이용 문구는 "불러오지 못했어요" 가 아니라 사실 문구', async () => {
    mockFetch({ meds: () => json(500, { code: 'INTERNAL', message: 'x' }) });
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    const printOnly = await screen.findByText('약 목록은 이 쪽에 담지 않았어요.');
    expect(printOnly.className).toContain('print-only');
    expect(screen.getByText('약 목록을 불러오지 못했어요.').className).toContain('no-print');
  });

  it('약이 없으면 안내 한 줄이고 투약 기준 고지는 남는다', async () => {
    mockFetch({
      meds: () => json(200, []),
      history: () => json(200, historyFixture(daysFixture(END, 30, { [END]: { weightKg: 4.2 } } as never))),
    });
    renderAt('/report');
    expect(await screen.findAllByText('이 기간에는 등록된 약이 없어요.')).not.toHaveLength(0);
    expect(screen.getByText('현재 등록된 약 기준이에요.')).toBeTruthy();
  });

  it('돌아오기는 from 값 기준이고, 지난 기록의 기간을 이어받는다', async () => {
    mockFetch({});
    renderAt('/report?range=30&from=history');
    expect(await screen.findByText('9월 9일 ~ 10월 8일 (30일)')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 지난 기록으로' }).getAttribute('href')).toBe('/history');
  });

  it('from 이 없으면 오늘로 돌아간다. 잘못된 range 는 14일', async () => {
    mockFetch({});
    renderAt('/report?range=90');
    expect(await screen.findByText('9월 25일 ~ 10월 8일 (14일)')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 오늘로' }).getAttribute('href')).toBe('/today');
  });

  it('지난 기록 화면에서 기간을 이어 링크가 걸리고, 같은 입력에서 숫자가 일치한다', async () => {
    mockFetch({});
    renderAt('/history');
    const link = await screen.findByRole('link', { name: '병원 방문 리포트 만들기 ›' });
    expect(link.getAttribute('href')).toBe('/report?range=30&from=history');
    await screen.findByText(/기록한 날 5일 \/ 30일/);

    cleanup();
    mockFetch({});
    renderAt('/report?range=30&from=history');
    await screen.findByText('9월 9일 ~ 10월 8일 (30일)');
    const days = history30().days;
    expect(recordedDayCount(days)).toBe(5);
    expect(screen.getByText('30일 중 5일 기록했어요.')).toBeTruthy();
    const totals = medicationTotals(days);
    expect(screen.getByText(`먹임 체크 ${totals.taken}회 / 예정 ${totals.scheduled}회`)).toBeTruthy();
  });

  it('방향키로 기간을 옮긴다', async () => {
    mockFetch({});
    renderAt('/report');
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    screen.getByRole('radio', { name: '14일 ✓' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '30일 ✓' })).toBeTruthy();
  });
});
