// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisitQuestion } from '../lib/visitQuestionApi';
import { visitQuestionExample as ex } from '../lib/visitQuestionFixtures';
import { VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import { json, PET } from './todoTestKit';
import VisitQuestionsPage from './VisitQuestionsPage';

// 목록 응답과 변경 응답 경합, 포커스 예약, 반려동물 전환 회귀. 응답 시점을 테스트가 쥔다.

const A = ex({ id: 'a', text: '첫째 질문', createdAt: '2026-10-15T01:00:00Z' });
const B = ex({ id: 'b', text: '둘째 질문', createdAt: '2026-10-15T02:00:00Z' });
const NEW = ex({ id: 'n', text: '새 질문', createdAt: '2026-10-15T03:00:00Z' });

type Resolver = (res: Response) => void;
const pending = () => {
  let resolve!: Resolver;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
};

function Harness({ pet }: { pet: typeof PET }) {
  return (
    <MemoryRouter initialEntries={['/visit-questions']}>
      <PetContext.Provider value={{ status: 'ready', pet, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <Routes>
          <Route path="/visit-questions" element={<VisitQuestionsPage />} />
        </Routes>
      </PetContext.Provider>
    </MemoryRouter>
  );
}

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const input = () => screen.getByLabelText(T.fieldLabel) as HTMLInputElement;
const list = (qs: VisitQuestion[]) => json(200, { questions: qs });

describe('목록 응답 경합', () => {
  it('변경 진행 중에 도착한 낡은 목록은 버리고, 변경이 끝난 뒤 다시 받는다. 추가한 글은 한 번만 보인다', async () => {
    const g3 = pending();
    const p2 = pending();
    let gets = 0;
    let posts = 0;
    const getCalls: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'POST') {
          posts += 1;
          return posts === 1 ? json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }) : p2.promise;
        }
        gets += 1;
        getCalls.push(gets);
        if (gets === 1) return list([A]);
        if (gets === 2) throw new TypeError('fail'); // 한도 409 뒤 다시 받기 실패 → 다시 불러오기 버튼
        if (gets === 3) return g3.promise;
        return list([A, NEW]); // 4번째: 변경이 끝난 뒤의 다시 받기
      }),
    );
    const user = userEvent.setup();
    render(<Harness pet={PET} />);
    await screen.findByText(A.text);
    await user.type(input(), '첫 시도{Enter}');
    await user.click(await screen.findByRole('button', { name: T.retry })); // GET 3 (지연)
    await waitFor(() => expect(gets).toBe(3));
    await user.clear(input());
    await user.type(input(), '새 질문{Enter}'); // POST 2 (지연)
    await waitFor(() => expect(posts).toBe(2));
    // 추가가 진행 중일 때 서버에는 이미 새 글이 있는 목록이 먼저 도착 → 버려진다
    await act(async () => g3.resolve(list([A, NEW])));
    expect(screen.queryByText(NEW.text)).toBeNull();
    expect(gets).toBe(3);
    // 추가 응답이 오면 한 번만 보이고 목록을 다시 받는다
    await act(async () => p2.resolve(json(201, NEW)));
    await waitFor(() => expect(gets).toBe(4));
    expect(await screen.findAllByText(NEW.text)).toHaveLength(1);
  });

  it('변경이 시작되기 전에 보낸 목록 응답이 변경이 끝난 뒤 도착하면 낡은 목록으로 덮지 않고 다시 받는다', async () => {
    const g3 = pending();
    let gets = 0;
    let posts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'POST') {
          posts += 1;
          return posts === 1 ? json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }) : json(201, NEW);
        }
        gets += 1;
        if (gets === 1) return list([A]);
        if (gets === 2) throw new TypeError('fail');
        if (gets === 3) return g3.promise;
        return list([A, NEW]);
      }),
    );
    const user = userEvent.setup();
    render(<Harness pet={PET} />);
    await screen.findByText(A.text);
    await user.type(input(), '첫 시도{Enter}');
    await user.click(await screen.findByRole('button', { name: T.retry })); // GET 3 (지연)
    await waitFor(() => expect(gets).toBe(3));
    await user.clear(input());
    await user.type(input(), '새 질문{Enter}');
    expect(await screen.findByText(NEW.text)).toBeTruthy(); // 추가 완료
    await act(async () => g3.resolve(list([A]))); // 추가 전에 만든 낡은 목록
    await waitFor(() => expect(gets).toBe(4));
    expect(await screen.findAllByText(NEW.text)).toHaveLength(1);
    expect(screen.getByText(A.text)).toBeTruthy();
  });
});

describe('포커스 예약', () => {
  it('지우는 요청 중 탭을 바꿔 이웃 줄이 사라져도 예약이 남아 포커스를 빼앗지 않고 입력 칸으로 간다', async () => {
    const del = pending();
    const C = ex({ id: 'c', text: '끝난 질문', createdAt: '2026-10-15T00:30:00Z', completed: true, completedAt: '2026-10-15T05:00:00Z' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ((init?.method ?? 'GET') === 'DELETE' ? del.promise : list([A, B, C]))),
    );
    const user = userEvent.setup();
    render(<Harness pet={PET} />);
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `지우기, ${A.text}` }));
    const card = (await screen.findByText(T.removeTitle)).closest('[role="alert"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: '지우기' }));
    await user.click(screen.getByRole('tab', { name: '물어본 것' })); // 낡은 rows 의 이웃(B)은 이 탭에 없다
    await act(async () => del.resolve(new Response(null, { status: 204 })));
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });
});

describe('반려동물 전환', () => {
  it('petId 가 바뀌면 이전 목록을 비우고 새 목록이 올 때까지 이전 글을 보이지 않는다', async () => {
    const second = pending();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => (String(input).includes('/pets/pet-2/') ? second.promise : list([A]))),
    );
    const { rerender } = render(<Harness pet={PET} />);
    await screen.findByText(A.text);
    rerender(<Harness pet={{ ...PET, id: 'pet-2' }} />);
    await waitFor(() => expect(screen.queryByText(A.text)).toBeNull());
    expect(screen.getByText(T.loading)).toBeTruthy();
    await act(async () => second.resolve(list([B])));
    expect(await screen.findByText(B.text)).toBeTruthy();
  });
});

describe('추가 버튼 비활성 사유', () => {
  it('첫 불러오기가 실패해 목록이 없으면 추가 버튼이 오류 안내와 연결된다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { code: 'X', message: 'x' })));
    render(<Harness pet={PET} />);
    const alert = await screen.findByRole('alert');
    const button = screen.getByRole('button', { name: T.addLabel }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(alert.id).toBe('vq-load-error');
    expect(button.getAttribute('aria-describedby')).toBe('vq-load-error');
  });
});
