// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pet, TodayResponse } from '../lib/petApi';
import { PetContext } from '../pet';
import TodayPage from './TodayPage';

// QA 추가: 알림으로 열린 오늘 화면의 큰 [먹였어요] 버튼 경계 시나리오 (알림-바로-체크)
// 기존 TodayPage.test.tsx 의 '대체 흐름' 테스트가 못 덮는 곳: 같은 약 두 회차, 409, 실패, 되돌리기 정합, 연타.

const PET: Pet = {
  id: 'pet-1', name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전', hasPhoto: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const dose = (medicationId: string, name: string, scheduledTime: string, taken = false) => ({
  medicationId, name, doseText: '1정', scheduledTime, taken,
  medLogId: taken ? `log-${medicationId}-${scheduledTime}` : null,
  takenAt: taken ? '2026-10-06T00:05:00Z' : null,
});
const today = (doses: ReturnType<typeof dose>[]): TodayResponse => ({
  recordDate: '2026-10-06', cutoffNotice: '새벽 4시 전 투약은 전날 기록으로 저장돼요', doses, dailyLog: null,
  suggestions: { foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: 4.35 }, lastWeight: { weightKg: 4.4, recordDate: '2026-10-03' },
});
const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (body: unknown) => Response | Promise<Response>;
function mockServer(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const all: Record<string, Handler> = { 'POST /api/events': () => new Response(null, { status: 202 }), ...routes };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      const h = all[`${method} ${url.pathname}`];
      return h ? h(body) : json(404, { code: 'NOT_FOUND', message: 'not found' });
    }),
  );
  return calls;
}
function renderToday(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: vi.fn(async () => {}), setPet: vi.fn() }}>
        <TodayPage />
      </PetContext.Provider>
    </MemoryRouter>,
  );
}
const bigButtons = () => screen.queryAllByRole('button', { name: /먹였어요 체크$/ });
const posts = (calls: Array<{ method: string; path: string }>) => calls.filter((c) => c.method === 'POST' && c.path === '/api/med-logs');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('오늘 화면 큰 버튼 — QA 경계', () => {
  it('이미 체크돼 있는 회차(409 ALREADY_CHECKED)면 체크 상태로 정리되고 큰 버튼이 사라진다', async () => {
    // 서버는 다른 곳(알림 버튼)에서 이미 체크된 상태: 이후 GET 은 taken=true 를 돌려준다
    let checked = false;
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, today([dose('m1', '아조딜', '08:00', checked)])),
      'POST /api/med-logs': () => {
        checked = true;
        return json(409, { code: 'ALREADY_CHECKED', message: 'x' });
      },
    });
    renderToday('/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    await userEvent.click(await screen.findByRole('button', { name: /아조딜.*먹였어요 체크$/ }, { timeout: 4000 }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    await waitFor(() => expect(bigButtons()).toHaveLength(0));
  });

  it('체크 요청이 실패(500)하면 롤백되어 큰 버튼이 다시 보이고 안내가 나온다(기록했다고 말하지 않는다)', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, today([dose('m1', '아조딜', '08:00')])),
      'POST /api/med-logs': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    renderToday('/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    await userEvent.click(await screen.findByRole('button', { name: /아조딜.*먹였어요 체크$/ }, { timeout: 4000 }));
    await waitFor(() => expect(bigButtons()).toHaveLength(1), { timeout: 4000 });
    expect(screen.queryByRole('button', { name: /체크 되돌리기/ })).toBeNull();
  });

  it('큰 버튼을 연타해도 POST 는 한 번만 나간다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, today([dose('m1', '아조딜', '08:00')])),
      'POST /api/med-logs': async () => {
        await gate;
        return json(201, { id: 'l1', medicationId: 'm1', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T00:05:00Z' });
      },
    });
    renderToday('/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    const big = await screen.findByRole('button', { name: /아조딜.*먹였어요 체크$/ }, { timeout: 4000 });
    const user = userEvent.setup();
    await user.click(big);
    await user.click(big);
    await user.click(big);
    release();
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /체크 되돌리기/ }).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(posts(calls)).toHaveLength(1);
  });

  it('체크 후 [되돌리기]를 누르면 DELETE 로 풀리고 큰 버튼이 다시 보인다(알림으로 연 화면 정합)', async () => {
    const calls = mockServer({
      'GET /api/pets/pet-1/today': () => json(200, today([dose('m1', '아조딜', '08:00')])),
      'POST /api/med-logs': () =>
        json(201, { id: 'log-9', medicationId: 'm1', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T00:05:00Z' }),
      'DELETE /api/med-logs/log-9': () => new Response(null, { status: 204 }),
    });
    renderToday('/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /아조딜.*먹였어요 체크$/ }, { timeout: 4000 }));
    const undo = await screen.findByRole('button', { name: /아조딜.*체크 되돌리기/ }, { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 600)); // 방금 체크한 줄은 접히는 동안 탭을 무시한다
    await user.click(undo);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(bigButtons()).toHaveLength(1), { timeout: 4000 });
  });

  // QA 보고 결함 수정: 같은 약의 아침 알림으로 연 화면에서 아침 회차를 체크하면 큰 [먹였어요]가 같은 약의 저녁 회차로 옮겨 가던 문제.
  // 이제 처음 정한 회차(약·시각이 모두 맞는 회차)에 고정하고, 체크하면 해제한다.
  it('같은 약의 다른 회차: 한 회차를 큰 버튼으로 체크하면 큰 버튼이 같은 약의 "다음 회차"로 옮겨 가지 않는다', async () => {
    // 아침 알림으로 연 화면에서 [먹였어요]를 누른 직후, 같은 약의 저녁 회차에 큰 버튼이 생기면 오기록(저녁 약을 미리 체크) 위험이 있다.
    mockServer({
      'GET /api/pets/pet-1/today': () => json(200, today([dose('m1', '아조딜', '08:00'), dose('m1', '아조딜', '20:00')])),
      'POST /api/med-logs': () =>
        json(201, { id: 'log-9', medicationId: 'm1', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T00:05:00Z' }),
    });
    renderToday('/today?source=push&med=m1&t=08:00&d=2026-10-06&n=1');
    await userEvent.click(await screen.findByRole('button', { name: /오전 8:00 먹였어요 체크$/ }, { timeout: 4000 }));
    await screen.findByRole('button', { name: /오전 8:00.*체크 되돌리기/ }, { timeout: 4000 });
    expect(screen.queryByRole('button', { name: /오후 8:00 먹였어요 체크$/ })).toBeNull();
  });

  it('알림의 약이 여러 개여도 큰 버튼은 알림을 누른 약 한 곳에만, 다른 약 카드는 그대로', async () => {
    mockServer({
      'GET /api/pets/pet-1/today': () =>
        json(200, today([dose('m1', '아조딜', '08:00'), dose('m2', '레나메진', '08:00'), dose('m3', '프로넥스', '08:00')])),
    });
    renderToday('/today?source=push&med=m3&t=08:00&d=2026-10-06&n=1');
    await screen.findByRole('button', { name: /프로넥스.*먹였어요 체크$/ }, { timeout: 4000 });
    expect(bigButtons()).toHaveLength(1);
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('프로넥스');
  });
});
