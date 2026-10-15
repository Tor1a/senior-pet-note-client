// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import type { HistoryResponse, Medication, Pet } from '../lib/petApi';
import { findReportForbidden, REPORT_TEXT as T } from '../lib/reportText';
import { setToken } from '../lib/tokenStorage';
import { visitQuestionExample as ex } from '../lib/visitQuestionFixtures';
import { PetContext } from '../pet';
import ReportPage from './ReportPage';

// 병원 방문 리포트 '물어볼 것 포함' (설계 5장): 기본 꺼짐, 미완료 항목만, 켜고 항목이 있을 때만 출력에 추가.
// 꺼짐/0개/조회 실패일 때 리포트 본문(.report-sheet)은 한 글자도 다르지 않고, 실패가 리포트를 막지 않는다.

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
const HISTORY: HistoryResponse = historyFixture(
  daysFixture(
    END,
    30,
    {
      '2026-10-03': { weightKg: 4.0, symptoms: ['cough'], memo: '사료를 잘게 불려 줬어요.' },
      '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
    } as never,
    {},
    { scheduledCount: 3, takenCount: 2 },
  ),
);
const EMPTY_HISTORY: HistoryResponse = historyFixture(daysFixture(END, 30, {} as never, {}, { scheduledCount: 0, takenCount: 0 }));

const Q1 = ex({ id: 'q1', text: '약을 식전에 줘도 되는지 물어보기' });
const Q2 = ex({ id: 'q2', text: '정상인가요? 이상해 보임 <b>그대로</b>' });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Questions = { ok: unknown } | { status: number } | { network: true };

function mockFetch(questions: Questions, history: HistoryResponse = HISTORY) {
  const urls: string[] = [];
  const state = { questions };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.pathname + url.search);
      if (url.pathname.endsWith('/visit-questions')) {
        const q = state.questions;
        if ('network' in q) throw new TypeError('offline');
        if ('status' in q) return json(q.status, { code: 'X', message: 'x' });
        return json(200, q.ok);
      }
      if (url.pathname.endsWith('/medications')) return json(200, MEDS);
      return json(200, history);
    }),
  );
  return { urls, state };
}

function renderReport() {
  return render(
    <MemoryRouter initialEntries={['/report']}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/report" element={<ReportPage />} />
          <Route path="/today" element={<p>오늘 화면</p>} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>,
  );
}

/** useId 로 생긴 id 는 렌더마다 달라서 빼고 비교한다 */
const printOutput = () => (document.querySelector('.report-frame')?.outerHTML ?? '').replace(/_r_[0-9a-z]+_/g, 'ID');

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('물어볼 것 포함 — 요청과 스위치', () => {
  it('리포트를 열 때 status=open 을 1번만 부르고, 7/30일 전환에도 다시 부르지 않는다', async () => {
    const { urls } = mockFetch({ ok: { questions: [Q1] } });
    const user = userEvent.setup();
    renderReport();
    await screen.findByRole('switch', { name: /물어볼 것 포함/ });
    await user.click(screen.getByRole('radio', { name: /^7일/ }));
    await user.click(screen.getByRole('radio', { name: /^30일/ }));
    expect(urls.filter((u) => u.includes('visit-questions'))).toEqual(['/api/pets/pet-1/visit-questions?status=open']);
  });

  it('기본은 꺼짐: 메모 스위치 아래에 스위치와 힌트가 있고 섹션은 없다', async () => {
    mockFetch({ ok: { questions: [Q1] } });
    renderReport();
    const memo = await screen.findByRole('switch', { name: /메모 포함/ });
    const sw = await screen.findByRole('switch', { name: /물어볼 것 포함/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toContain('꺼짐');
    expect(sw.className).not.toContain('is-on');
    expect(screen.getByText(T.questionsHintWeb)).toBeTruthy();
    expect(memo.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sw.closest('.report-actions')).toBe(memo.closest('.report-actions'));
    expect(sw.closest('.no-print')).toBeTruthy();
    expect(document.querySelector('.report-questions')).toBeNull();
    expect(screen.queryByText(T.questionsTitle)).toBeNull();
    // 메모 스위치 -> 물어볼 것 스위치 -> 인쇄하기 순서
    const order = screen.getAllByRole('switch').map((b) => b.textContent);
    expect(order[0]).toContain('메모 포함');
    expect(order[1]).toContain('물어볼 것 포함');
  });

  it('켜면 메모 섹션 아래·기록 없는 날 위에 미완료 글이 적힌 그대로 나온다(가공·검열 없음). 끄면 사라진다', async () => {
    mockFetch({ ok: { questions: [Q1, Q2] } });
    const user = userEvent.setup();
    renderReport();
    const sw = await screen.findByRole('switch', { name: /물어볼 것 포함/ });
    await user.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.textContent).toContain('켜짐');
    const section = document.querySelector('.report-questions') as HTMLElement;
    expect(within(section).getByRole('heading', { level: 2, name: T.questionsTitle })).toBeTruthy();
    expect(within(section).getByText(T.questionsNote)).toBeTruthy();
    const items = within(section).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.report-user-text')?.textContent)).toEqual([Q1.text, Q2.text]);
    expect(items[1].querySelector('.report-user-text')?.innerHTML).not.toContain('<b>');
    expect(items[0].querySelector('[aria-hidden="true"]')?.textContent).toBe('☐ ');
    const memoSection = document.querySelector('.report-memo-section') as HTMLElement;
    const gaps = document.querySelector('.report-gaps') as HTMLElement;
    expect(memoSection.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(gaps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 앱이 만든 섹션 문구는 금칙어가 없다(사용자 글 제외)
    const appText = [T.questionsTitle, T.questionsNote, T.questionsSwitch, T.questionsHintWeb].join(' ');
    expect(findReportForbidden(appText)).toBeNull();

    await user.click(sw);
    expect(document.querySelector('.report-questions')).toBeNull();
  });

  it('옵션은 어디에도 저장하지 않는다: 다시 열면 꺼짐', async () => {
    mockFetch({ ok: { questions: [Q1] } });
    const user = userEvent.setup();
    const first = renderReport();
    await user.click(await screen.findByRole('switch', { name: /물어볼 것 포함/ }));
    first.unmount();
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('물어');
    renderReport();
    expect((await screen.findByRole('switch', { name: /물어볼 것 포함/ })).getAttribute('aria-checked')).toBe('false');
  });
});

describe('물어볼 것 포함 — 0개·실패·기록 없음은 기존 출력과 완전 동일', () => {
  it('0개: 스위치도 섹션도 없고 리포트 본문이 항목이 있는 꺼짐 상태와 같다', async () => {
    mockFetch({ ok: { questions: [] } });
    renderReport();
    await screen.findByRole('switch', { name: /메모 포함/ });
    await waitFor(() => expect(document.querySelector('.report-sheet')).toBeTruthy());
    expect(screen.queryByRole('switch', { name: /물어볼 것 포함/ })).toBeNull();
    expect(screen.queryByText(T.questionsFailed)).toBeNull();
    const zero = printOutput();
    cleanup();

    mockFetch({ ok: { questions: [Q1] } });
    renderReport();
    await screen.findByRole('switch', { name: /물어볼 것 포함/ });
    expect(printOutput()).toBe(zero);
  });

  it('응답이 비정상(null)이어도 0개로 취급한다', async () => {
    mockFetch({ ok: null });
    renderReport();
    await screen.findByRole('switch', { name: /메모 포함/ });
    expect(screen.queryByRole('switch', { name: /물어볼 것 포함/ })).toBeNull();
    expect(screen.queryByText(T.questionsFailed)).toBeNull();
  });

  for (const [label, failure] of [
    ['네트워크 오류', { network: true } as const],
    ['500', { status: 500 }],
  ] as const) {
    it(`조회 실패(${label}): 스위치 없음, 화면 전용 실패 줄 + 다시 불러오기, 리포트·인쇄는 그대로`, async () => {
      mockFetch({ ok: { questions: [Q1] } });
      const reference = await (async () => {
        renderReport();
        await screen.findByRole('switch', { name: /물어볼 것 포함/ });
        const html = printOutput();
        cleanup();
        return html;
      })();

      const { state } = mockFetch(failure);
      const user = userEvent.setup();
      renderReport();
      const status = await screen.findByText(T.questionsFailed);
      expect(status.closest('[role="status"]')).toBeTruthy();
      expect(status.closest('.no-print')).toBeTruthy(); // 종이에는 나오지 않는다
      expect(screen.queryByRole('switch', { name: /물어볼 것 포함/ })).toBeNull();
      expect(printOutput()).toBe(reference); // 리포트 본문 동일
      expect((screen.getAllByRole('button', { name: T.print })[0] as HTMLButtonElement).disabled).toBe(false);
      expect(document.querySelector('.report-sheet')?.textContent).not.toContain(T.questionsFailed);

      // 다시 불러오기가 성공하면 스위치가 나온다
      state.questions = { ok: { questions: [Q1] } };
      await user.click(within(status.closest('[role="status"]') as HTMLElement).getByRole('button', { name: T.retry }));
      expect(await screen.findByRole('switch', { name: /물어볼 것 포함/ })).toBeTruthy();
      expect(screen.queryByText(T.questionsFailed)).toBeNull();
    });
  }

  it('기록이 없는 기간(recorded 0)에는 스위치·실패 줄을 숨긴다', async () => {
    mockFetch({ ok: { questions: [Q1] } }, EMPTY_HISTORY);
    renderReport();
    await screen.findByText(T.emptyTitle);
    expect(screen.queryByRole('switch', { name: /물어볼 것 포함/ })).toBeNull();
    cleanup();
    mockFetch({ status: 500 }, EMPTY_HISTORY);
    renderReport();
    await screen.findByText(T.emptyTitle);
    expect(screen.queryByText(T.questionsFailed)).toBeNull();
  });

  it('기록이 없는 기간에는 물어볼 것 목록을 아예 요청하지 않는다', async () => {
    const { urls } = mockFetch({ ok: { questions: [Q1] } }, EMPTY_HISTORY);
    renderReport();
    await screen.findByText(T.emptyTitle);
    expect(urls.filter((u) => u.includes('visit-questions'))).toEqual([]);
  });

  it('요청이 아직 끝나지 않았을 때도 리포트 본문은 보이고 인쇄가 막히지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/visit-questions')) return new Promise<Response>(() => {});
        if (url.pathname.endsWith('/medications')) return json(200, MEDS);
        return json(200, HISTORY);
      }),
    );
    renderReport();
    await waitFor(() => expect(document.querySelector('.report-sheet')).toBeTruthy());
    expect(screen.queryByRole('switch', { name: /물어볼 것 포함/ })).toBeNull();
    expect((screen.getAllByRole('button', { name: T.print })[0] as HTMLButtonElement).disabled).toBe(false);
  });
});
