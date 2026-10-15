// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisitQuestion } from '../lib/visitQuestionApi';
import { visitQuestionExample as ex } from '../lib/visitQuestionFixtures';
import { findVisitQuestionForbidden, VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { setToken } from '../lib/tokenStorage';
import { PetContext } from '../pet';
import { json, PET } from './todoTestKit';
import VisitQuestionsPage from './VisitQuestionsPage';

// 진료 때 물어볼 것 화면 (설계 4장 상태표). 서버 없이 fetch 를 상태를 가진 가짜로 바꾼다.

interface Call {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

function fakeServer(initial: VisitQuestion[], opts: { failList?: number | 'network'; failListAt?: number; failWrite?: Response } = {}) {
  let store = [...initial];
  let listCalls = 0;
  let seq = 100;
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, search: url.search, body });
      const isList = url.pathname === '/api/pets/pet-1/visit-questions';
      if (method === 'GET' && isList) {
        listCalls += 1;
        if (opts.failList && listCalls === (opts.failListAt ?? 1)) {
          if (opts.failList === 'network') throw new TypeError('fail');
          return json(opts.failList, { code: 'X', message: 'x' });
        }
        const open = store.filter((q) => !q.completed);
        const done = store.filter((q) => q.completed);
        return json(200, { questions: [...open, ...done] });
      }
      if (method !== 'GET' && opts.failWrite) return opts.failWrite.clone();
      if (method === 'POST' && isList) {
        const q = ex({
          id: `vq-${seq++}`,
          text: String((body as { text: string }).text),
          createdAt: `2026-10-15T09:00:${String(seq % 60).padStart(2, '0')}Z`,
        });
        store.push(q);
        return json(201, q);
      }
      const m = url.pathname.match(/^\/api\/visit-questions\/([^/]+)(\/completion)?$/);
      if (m) {
        const target = store.find((q) => q.id === m[1]);
        if (!target) return json(404, { code: 'NOT_FOUND', message: 'nf' });
        if (method === 'DELETE') {
          store = store.filter((q) => q.id !== target.id);
          return new Response(null, { status: 204 });
        }
        const next: VisitQuestion = m[2]
          ? {
              ...target,
              completed: (body as { completed: boolean }).completed,
              completedAt: (body as { completed: boolean }).completed ? '2026-10-15T10:00:00Z' : null,
            }
          : { ...target, text: (body as { text: string }).text };
        store = store.map((q) => (q.id === next.id ? next : q));
        return json(200, next);
      }
      return json(404, { code: 'NOT_FOUND', message: 'nf' });
    }),
  );
  return { calls, get store() { return store; } };
}

function Probe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname + loc.search}</p>;
}

function renderPage(path = '/visit-questions', reloadPet = vi.fn(async () => {})) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet, setPet: vi.fn() }}>
        <Routes>
          <Route path="/visit-questions" element={<VisitQuestionsPage />} />
          <Route path="/today" element={<p>오늘 화면</p>} />
          <Route path="/todos" element={<p>할 일 목록 화면</p>} />
          <Route path="/checklist" element={<p>체크리스트 화면</p>} />
        </Routes>
        <Probe />
      </PetContext.Provider>
    </MemoryRouter>,
  );
  return reloadPet;
}

const A = ex({ id: 'a', text: '약을 식전에 줘도 되는지 물어보기', createdAt: '2026-10-15T01:00:00Z' });
const B = ex({ id: 'b', text: '밤에 자주 깨는 것도 얘기하기', createdAt: '2026-10-15T02:00:00Z' });
const C = ex({
  id: 'c',
  text: '사료를 바꿔도 되는지',
  createdAt: '2026-10-15T00:30:00Z',
  completed: true,
  completedAt: '2026-10-15T05:00:00Z',
});

beforeEach(() => setToken('test-token'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const input = () => screen.getByLabelText(T.fieldLabel) as HTMLInputElement;
const paths = (calls: Call[]) => calls.map((c) => `${c.method} ${c.path}${c.search}`);

describe('V2 정상', () => {
  it('status=all 을 1번 받고 남은 것(등록 순)만 보인다. 완료는 물어본 탭에 있다', async () => {
    const server = fakeServer([C, B, A]);
    renderPage();
    expect(await screen.findByText(A.text)).toBeTruthy();
    expect(paths(server.calls)).toEqual(['GET /api/pets/pet-1/visit-questions?status=all']);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain(A.text);
    expect(items[1]).toContain(B.text);
    expect(screen.queryByText(C.text)).toBeNull();
    expect(screen.getByRole('tab', { name: '남은 것' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '물어본 것' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: T.tabGroup })).toBeTruthy();
  });

  it('제목·안내·면책이 있고 입력 칸에는 placeholder 가 없다. 개수·배지·N개 남음이 없다', async () => {
    fakeServer([A, B, C]);
    renderPage();
    await screen.findByText(A.text);
    expect(screen.getByRole('heading', { level: 1, name: T.title })).toBeTruthy();
    expect(screen.getByText(T.guide)).toBeTruthy();
    expect(screen.getByText(T.privacyHelp)).toBeTruthy();
    expect(screen.getByText('본 기록은 의료적 판단을 대신하지 않습니다.')).toBeTruthy();
    expect(input().hasAttribute('placeholder')).toBe(false);
    expect(input().getAttribute('type')).toBe('text');
    expect(input().getAttribute('aria-describedby')).toContain('vq-privacy');
    expect(screen.getByText('0 / 100')).toBeTruthy();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/남음|남았|\d+\s*\/\s*30|진행/);
    expect(body).not.toContain('질문');
    expect(screen.getByRole('tab', { name: '남은 것' }).textContent).not.toMatch(/\d/);
    expect(screen.getByRole('tab', { name: '물어본 것' }).textContent).not.toMatch(/\d/);
  });

  it('앱이 만든 화면 글은 금칙어가 없다. 사용자 글(이상해 보임, <b>)은 가공 없이 그대로 보인다', async () => {
    const odd = ex({ id: 'odd', text: '정상인가요? 이상해 보임 <b>굵게</b>' });
    fakeServer([odd]);
    renderPage();
    const text = await screen.findByText(odd.text);
    expect(text.innerHTML).not.toContain('<b>');
    expect(text.textContent).toBe(odd.text);
    // 사용자 글을 뺀 앱 글에는 금칙어가 없다
    const app = (document.body.textContent ?? '').replace(odd.text, '').replace(/정상인가요\?/g, '');
    expect(findVisitQuestionForbidden(app)).toBeNull();
    // 접근성 이름: 앱 문구 + 글
    expect(screen.getByRole('button', { name: `물어봤어요, ${odd.text}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `고치기, ${odd.text}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `지우기, ${odd.text}` })).toBeTruthy();
    // 개수·순서 낭독 없음
    for (const b of screen.getAllByRole('button')) {
      expect(b.getAttribute('aria-label') ?? '').not.toMatch(/\d+개 중|남은 \d+개|번째/);
    }
  });

  it('서버 목록을 localStorage 에 저장하지 않는다', async () => {
    fakeServer([A]);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderPage();
    await screen.findByText(A.text);
    await userEvent.setup().type(input(), '새 글');
    expect(setItem.mock.calls.filter(([k]) => k !== 'spn.accessToken')).toEqual([]);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(A.text);
    setItem.mockRestore();
  });

  it('V17 응답이 비정상(null)이면 빈 목록', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    renderPage();
    expect(await screen.findByText(T.emptyOpen)).toBeTruthy();
  });
});

describe('V3 V4 빈 상태', () => {
  it('남은 것/물어본 것 빈 문구. 권유·독촉이 없다', async () => {
    fakeServer([]);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('적어 둔 것이 없어요.')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: '물어본 것' }));
    expect(screen.getByText('물어봤다고 체크한 것이 없어요.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('아직');
  });
});

describe('추가', () => {
  it('Enter 로 추가: 정규화된 글을 POST 하고 입력을 비우며 포커스를 유지한다. 안내는 role=status', async () => {
    const server = fakeServer([A]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.type(input(), '  새로 적은 글  {Enter}');
    expect(await screen.findByText('새로 적은 글')).toBeTruthy();
    const post = server.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ text: '새로 적은 글' });
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());
    expect(within(screen.getByRole('status')).getByText(T.added)).toBeTruthy();
    // 목록은 다시 받지 않는다(로컬 반영)
    expect(server.calls.filter((c) => c.method === 'GET')).toHaveLength(1);
  });

  it('추가 버튼 보이는 글자는 추가, 접근성 이름은 물어볼 것 추가', async () => {
    fakeServer([]);
    renderPage();
    await screen.findByText(T.emptyOpen);
    const button = screen.getByRole('button', { name: T.addLabel });
    expect(button.textContent).toBe(T.add);
  });

  it('줄바꿈이 섞인 값은 공백으로 바꿔 보낸다', async () => {
    const server = fakeServer([]);
    renderPage();
    await screen.findByText(T.emptyOpen);
    fireEvent.change(input(), { target: { value: '앞 줄\n뒷 줄' } });
    fireEvent.submit(input().closest('form')!);
    await waitFor(() => expect(server.calls.some((c) => c.method === 'POST')).toBe(true));
    const text = (server.calls.find((c) => c.method === 'POST')!.body as { text: string }).text;
    expect(text).not.toMatch(/[\r\n]/);
    expect(text.replace(/\s+/g, ' ')).toMatch(/^앞 줄 ?뒷 줄$/);
  });

  it('V11 빈 입력: 서버 호출 없이 오류 줄, aria-invalid, 포커스는 입력 칸', async () => {
    const server = fakeServer([A]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.type(input(), '   ');
    await user.click(screen.getByRole('button', { name: T.addLabel }));
    expect((await screen.findByRole('alert')).textContent).toBe(T.errorEmpty);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toContain('vq-add-problem');
    expect(document.activeElement).toBe(input());
    expect(server.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('V12 100자는 보내고 101자는 자르지 않고 오류 줄(글자 수 101 / 100). 이모지는 1자', async () => {
    const server = fakeServer([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(T.emptyOpen);
    fireEvent.change(input(), { target: { value: '가'.repeat(101) } });
    expect(screen.getByText('101 / 100')).toBeTruthy();
    expect(input().value).toBe('가'.repeat(101));
    await user.click(screen.getByRole('button', { name: T.addLabel }));
    expect((await screen.findByRole('alert')).textContent).toBe(T.errorTooLong);
    expect(input().value).toBe('가'.repeat(101));
    expect(server.calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.change(input(), { target: { value: '😀'.repeat(100) } });
    expect(screen.getByText('100 / 100')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: T.addLabel }));
    await waitFor(() => expect(server.calls.some((c) => c.method === 'POST')).toBe(true));
    expect((server.calls.find((c) => c.method === 'POST')!.body as { text: string }).text).toBe('😀'.repeat(100));
  });

  it('V10 추가 실패: 입력한 글이 남고 alert 에 사유와 다시 누르라는 안내', async () => {
    fakeServer([A], { failWrite: json(500, { code: 'X', message: 'x' }) });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.type(input(), '실패할 글');
    await user.click(screen.getByRole('button', { name: T.addLabel }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(T.errorAdd);
    expect(alert.textContent).toContain('서버에 잠시 문제가 있어요');
    expect(alert.textContent).toContain(T.errorRetryHint);
    expect(input().value).toBe('실패할 글');
  });

  it('V9 서버 409(code)가 먼저 오면 한도 문구를 alert 로, 글은 유지하고 목록을 다시 받는다', async () => {
    const server = fakeServer([A], { failWrite: json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: '서버 문장은 안 쓴다' }) });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.type(input(), '한 개 더');
    await user.click(screen.getByRole('button', { name: T.addLabel }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(T.limitReached);
    expect(alert.id).toBe('vq-limit');
    expect(screen.getAllByText(T.limitReached)).toHaveLength(1); // 오류 문구와 한도 안내가 겹치지 않는다
    expect(alert.textContent).not.toContain('서버 문장');
    expect(input().value).toBe('한 개 더');
    await waitFor(() => expect(server.calls.filter((c) => c.method === 'GET')).toHaveLength(2));
  });

  it('V8 30개면 한도 안내가 입력 위에 보이고 추가가 비활성이며 안내가 버튼 설명으로 연결된다. 입력은 쓸 수 있다', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ex({ id: `q${i}`, text: `글 ${i}`, createdAt: `2026-10-15T00:${String(i).padStart(2, '0')}:00Z` }));
    const server = fakeServer(many);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('글 0');
    const limit = screen.getByText(T.limitReached);
    const button = screen.getByRole('button', { name: T.addLabel }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(limit.id);
    expect(limit.compareDocumentPosition(input()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.type(input(), '쓸 수 있음{Enter}');
    expect(input().value).toBe('쓸 수 있음');
    expect(server.calls.some((c) => c.method === 'POST')).toBe(false);
    // 한도에서도 지우기·고치기·체크는 가능
    expect(screen.getAllByRole('button', { name: /^고치기, / }).length).toBe(30);
  });

  it('물어본 탭에서 추가하면 남은 것에서 볼 수 있다는 안내', async () => {
    fakeServer([A, C]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('tab', { name: '물어본 것' }));
    await user.type(input(), '다른 글{Enter}');
    expect(await screen.findByText(T.addedElsewhere)).toBeTruthy();
  });
});

describe('물어봤어요 · 되돌리기', () => {
  it('체크하면 줄이 접히고 되돌리기로 포커스가 간다. 되돌리면 같은 자리로 돌아오고 물어봤어요로 포커스', async () => {
    const server = fakeServer([A, B]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `물어봤어요, ${A.text}` }));
    const undo = await screen.findByRole('button', { name: `${A.text} 물어봤어요 되돌리기` });
    expect(document.activeElement).toBe(undo);
    expect(server.calls.at(-1)).toMatchObject({ method: 'PUT', path: '/api/visit-questions/a/completion', body: { completed: true } });
    const row = undo.closest('li')!;
    expect(row.textContent).toContain('✓');
    expect(row.textContent).toContain(`${A.text} · 물어봤어요`);
    expect(within(screen.getByRole('status')).getByText(T.doneNotice)).toBeTruthy();
    // 체크 안 한 줄은 그대로(접힌 줄이 첫 자리에 남는다)
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toBe(row);
    expect(rows[1].textContent).toContain(B.text);

    await user.click(undo);
    const done = await screen.findByRole('button', { name: `물어봤어요, ${A.text}` });
    expect(document.activeElement).toBe(done);
    expect(server.calls.at(-1)).toMatchObject({ body: { completed: false } });
    expect(within(screen.getByRole('status')).getByText(T.undoneNotice)).toBeTruthy();
    expect(screen.getAllByRole('listitem')[0].textContent).toContain(A.text);
  });

  it('탭을 바꿨다 오면 접힌 줄이 사라지고 물어본 탭에 있다. 거기서 되돌리면 남은 것의 등록 순 자리로 간다', async () => {
    fakeServer([A, B]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `물어봤어요, ${A.text}` }));
    await screen.findByRole('button', { name: `${A.text} 물어봤어요 되돌리기` });
    await user.click(screen.getByRole('tab', { name: '물어본 것' }));
    const doneRow = screen.getByText(A.text).closest('li')!;
    expect(doneRow.textContent).toContain('물어봤어요');
    expect(within(doneRow).queryByRole('button', { name: /^고치기/ })).toBeNull(); // 물어본 줄에는 고치기가 없다
    await user.click(screen.getByRole('tab', { name: '남은 것' }));
    expect(screen.queryByRole('button', { name: `${A.text} 물어봤어요 되돌리기` })).toBeNull(); // 접힌 줄 정리
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining(B.text)]);

    await user.click(screen.getByRole('tab', { name: '물어본 것' }));
    await user.click(screen.getByRole('button', { name: `${A.text} 물어봤어요 되돌리기` }));
    await waitFor(() => expect(screen.getByText(T.emptyDone)).toBeTruthy());
    // 마지막 줄을 되돌리면 포커스는 탭으로
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '물어본 것' }));
    await user.click(screen.getByRole('tab', { name: '남은 것' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.slice(0, 8))).toEqual([
      expect.stringContaining('약을 식전에'),
      expect.stringContaining('밤에 자주'),
    ]);
  });

  it('V13 체크 실패: 그 줄 안 alert, 줄은 원래 상태', async () => {
    fakeServer([A], { failWrite: json(500, { code: 'X', message: 'x' }) });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `물어봤어요, ${A.text}` }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(T.errorDone);
    expect(alert.textContent).toContain(T.errorRetryHint);
    expect(screen.getByRole('button', { name: `물어봤어요, ${A.text}` })).toBeTruthy();
  });

  it('V15 404(다른 기기에서 지움): 안내 후 목록을 다시 받는다', async () => {
    const server = fakeServer([A]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    server.store.length = 0; // 서버에서 사라짐
    await user.click(screen.getByRole('button', { name: `물어봤어요, ${A.text}` }));
    expect(await screen.findByText(T.gone)).toBeTruthy();
    await waitFor(() => expect(server.calls.filter((c) => c.method === 'GET')).toHaveLength(2));
    expect(await screen.findByText(T.emptyOpen)).toBeTruthy();
  });
});

describe('고치기', () => {
  it('같은 줄이 입력 칸으로 바뀌고 글 끝에 커서가 간다. 저장하면 PUT 후 줄로 돌아가며 고치기로 포커스', async () => {
    const server = fakeServer([A]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `고치기, ${A.text}` }));
    const edit = document.getElementById('vq-edit-a') as HTMLInputElement;
    expect(document.activeElement).toBe(edit);
    expect(edit.value).toBe(A.text);
    expect(edit.selectionStart).toBe(A.text.length);
    expect(edit.hasAttribute('placeholder')).toBe(false);
    // 도움말은 다시 쓰지 않는다
    expect(screen.getAllByText(T.privacyHelp)).toHaveLength(1);
    await user.type(edit, ' 고침{Enter}');
    expect(await screen.findByText(`${A.text} 고침`)).toBeTruthy();
    expect(server.calls.at(-1)).toMatchObject({ method: 'PUT', path: '/api/visit-questions/a', body: { text: `${A.text} 고침` } });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: `고치기, ${A.text} 고침` }));
    expect(within(screen.getByRole('status')).getByText(T.edited)).toBeTruthy();
  });

  it('바꾼 게 없으면 서버 호출 없이 줄로 돌아간다. Esc 는 초안을 버리고 고치기로 포커스', async () => {
    const server = fakeServer([A, B]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `고치기, ${A.text}` }));
    await user.click(screen.getByRole('button', { name: `${A.text} 고친 내용 저장` }));
    expect(server.calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(screen.getByRole('button', { name: `고치기, ${A.text}` })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: `고치기, ${A.text}` }));
    await user.type(document.activeElement as HTMLElement, '지워질 초안{Escape}');
    expect(screen.getByText(A.text)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: `고치기, ${A.text}` }));
  });

  it('줄마다 초안을 따로 가진다(다른 줄 고치기를 눌러도 먼저 고치던 글이 남는다)', async () => {
    fakeServer([A, B]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `고치기, ${A.text}` }));
    await user.type(document.activeElement as HTMLElement, ' 초안A');
    await user.click(screen.getByRole('button', { name: `고치기, ${B.text}` }));
    expect((document.getElementById('vq-edit-a') as HTMLInputElement).value).toBe(`${A.text} 초안A`);
    expect((document.getElementById('vq-edit-b') as HTMLInputElement).value).toBe(B.text);
  });

  it('V14 저장 실패·100자 초과·빈 값은 줄 안 오류, 초안 유지', async () => {
    fakeServer([A], { failWrite: json(500, { code: 'X', message: 'x' }) });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `고치기, ${A.text}` }));
    const edit = document.getElementById('vq-edit-a') as HTMLInputElement;
    fireEvent.change(edit, { target: { value: '가'.repeat(101) } });
    await user.click(screen.getByRole('button', { name: /고친 내용 저장/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(T.errorTooLong);
    expect(edit.getAttribute('aria-invalid')).toBe('true');
    expect(edit.value).toBe('가'.repeat(101));
    fireEvent.change(edit, { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: /고친 내용 저장/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(T.errorEmpty);
    fireEvent.change(edit, { target: { value: '고칠 글' } });
    await user.click(screen.getByRole('button', { name: /고친 내용 저장/ }));
    expect((await screen.findByRole('alert')).textContent).toContain(T.errorEdit);
    expect(edit.value).toBe('고칠 글');
  });
});

describe('지우기', () => {
  it('확인 카드에 글을 그대로 보여 주고 그대로 두기가 위에 있다. 지우면 DELETE 후 다음 줄로 포커스', async () => {
    const server = fakeServer([A, B]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `지우기, ${A.text}` }));
    const card = (await screen.findByText(T.removeTitle)).closest('[role="alert"]') as HTMLElement;
    expect(card.parentElement!.textContent).toContain(A.text);
    expect(card.textContent).toContain(T.removeBody);
    const buttons = within(card).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['그대로 두기', '지우기']);
    expect(document.activeElement?.textContent).toBe(T.removeTitle);

    await user.click(within(card).getByRole('button', { name: '지우기' }));
    await waitFor(() => expect(screen.queryByText(A.text)).toBeNull());
    expect(server.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/visit-questions/a' });
    expect(within(screen.getByRole('status')).getByText(T.removed)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: `물어봤어요, ${B.text}` }));
  });

  it('그대로 두기는 요청 없이 닫는다. 마지막 줄을 지우면 포커스는 입력 칸', async () => {
    const server = fakeServer([A]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `지우기, ${A.text}` }));
    await user.click(await screen.findByRole('button', { name: '그대로 두기' }));
    expect(server.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: `지우기, ${A.text}` }));

    await user.click(screen.getByRole('button', { name: `지우기, ${A.text}` }));
    await user.click(within((await screen.findByText(T.removeTitle)).closest('[role="alert"]') as HTMLElement).getByRole('button', { name: '지우기' }));
    await screen.findByText(T.emptyOpen);
    expect(document.activeElement).toBe(input());
  });

  it('Esc 는 확인 카드를 닫지 않는다. 실패하면 카드 안에 오류', async () => {
    fakeServer([A], { failWrite: json(500, { code: 'X', message: 'x' }) });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.click(screen.getByRole('button', { name: `지우기, ${A.text}` }));
    const card = (await screen.findByText(T.removeTitle)).closest('[role="alert"]') as HTMLElement;
    await user.keyboard('{Escape}');
    expect(screen.getByText(T.removeTitle)).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: '지우기' }));
    await waitFor(() => expect(card.textContent).toContain(T.errorRemove));
    expect(screen.getByText(T.removeTitle)).toBeTruthy();
  });
});

describe('불러오기 오류', () => {
  it('V5 네트워크 오류: 공통 문구 + 다시 불러오기, 추가는 비활성이지만 입력은 된다. 다시 누르면 목록', async () => {
    const server = fakeServer([A], { failList: 'network' });
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('서버에 연결할 수 없어요');
    expect((screen.getByRole('button', { name: T.addLabel }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(input(), '쓸 수 있어요');
    expect(input().value).toBe('쓸 수 있어요');
    await user.click(screen.getByRole('button', { name: T.retry }));
    expect(await screen.findByText(A.text)).toBeTruthy();
    expect(server.calls.filter((c) => c.method === 'GET')).toHaveLength(2);
    expect(input().value).toBe('쓸 수 있어요');
    expect((screen.getByRole('button', { name: T.addLabel }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('V6 그 밖의 오류는 loadFailed 문구', async () => {
    fakeServer([A], { failList: 500 });
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain(T.loadFailed);
  });

  it('V1 로딩 중에도 제목·입력은 보이고 추가는 비활성, 패널은 aria-busy', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    renderPage();
    expect(screen.getByText(T.loading)).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: T.addLabel }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: T.addLabel }).getAttribute('aria-describedby')).toBe('vq-loading');
    expect(input()).toBeTruthy();
  });

  it('V7 이미 목록이 있는데 다시 불러오기가 실패하면 목록은 두고 최신이 아닐 수 있다는 문구 + 다시 불러오기', async () => {
    // 첫 GET 은 성공, 한도 409 로 유도된 두 번째 GET 은 네트워크 오류
    const server = fakeServer([A], {
      failList: 'network',
      failListAt: 2,
      failWrite: json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    await user.type(input(), '글{Enter}');
    expect(await screen.findByText(T.stale)).toBeTruthy();
    expect(screen.getByText(A.text)).toBeTruthy();
    expect(screen.queryByText(T.loadFailed)).toBeNull();
    await user.click(screen.getByRole('button', { name: T.retry }));
    await waitFor(() => expect(screen.queryByText(T.stale)).toBeNull());
    expect(server.calls.filter((c) => c.method === 'GET')).toHaveLength(3);
  });

  it('404(반려동물 없음)이면 반려동물 정보를 다시 읽는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { code: 'NOT_FOUND', message: 'nf' })));
    const reload = renderPage();
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});

describe('뒤로 가기 · 이탈 확인', () => {
  it('?from 에 따라 뒤로 링크 문구와 목적지가 다르다', async () => {
    for (const [path, label, dest] of [
      ['/visit-questions', '← 오늘로', '오늘 화면'],
      ['/visit-questions?from=todos', '← 할 일 목록으로', '할 일 목록 화면'],
      ['/visit-questions?from=checklist', '← 처음 키워요 체크리스트로', '체크리스트 화면'],
    ] as const) {
      fakeServer([]);
      renderPage(path);
      await screen.findByText(T.emptyOpen);
      await userEvent.setup().click(screen.getByRole('button', { name: label }));
      expect(await screen.findByText(dest)).toBeTruthy();
      cleanup();
    }
  });

  it('적던 글이 있으면 나가기 전에 확인한다. 계속 고치기는 머물고 나가기는 이동', async () => {
    fakeServer([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(T.emptyOpen);
    await user.type(input(), '적던 글');
    await user.click(screen.getByRole('button', { name: '← 오늘로' }));
    expect(await screen.findByText(T.leaveTitle)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: T.leaveStay }));
    expect(screen.queryByText(T.leaveTitle)).toBeNull();
    expect(input().value).toBe('적던 글');
    await user.click(screen.getByRole('button', { name: '← 오늘로' }));
    await user.click(await screen.findByRole('button', { name: T.leaveGo }));
    expect(await screen.findByText('오늘 화면')).toBeTruthy();
  });
});

describe('탭 키보드', () => {
  it('좌우 방향키로 탭을 옮긴다', async () => {
    fakeServer([A, C]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(A.text);
    screen.getByRole('tab', { name: '남은 것' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '물어본 것' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '물어본 것' }));
    expect(screen.getByText(C.text)).toBeTruthy();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: '남은 것' }).getAttribute('aria-selected')).toBe('true');
  });
});
