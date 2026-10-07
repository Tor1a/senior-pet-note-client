// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setToken } from './lib/tokenStorage';
import { PetProvider, usePet } from './pet';

const PET = { id: 'pet-1', name: '보리', species: 'dog', birthYear: 2012, conditions: '', hasPhoto: false, createdAt: '', updatedAt: '' };

function Probe() {
  const { status, pet, reload } = usePet();
  return (
    <>
      <p data-testid="status">{status}</p>
      <p>{pet?.name ?? '-'}</p>
      <button onClick={() => void reload()}>재확인</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('PetProvider.reload', () => {
  it('이미 반려동물이 있으면 재확인 중에도 ready 를 유지한다(화면이 언마운트되지 않음)', async () => {
    setToken('t');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls > 1) await gate;
        return new Response(JSON.stringify([PET]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    render(
      <PetProvider>
        <Probe />
      </PetProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    await userEvent.setup().click(screen.getByText('재확인'));
    await waitFor(() => expect(calls).toBe(2));
    expect(screen.getByTestId('status').textContent).toBe('ready');
    release();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
  });

  it('재확인 결과 반려동물이 없어졌으면 none 으로 바뀐다', async () => {
    setToken('t');
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return new Response(JSON.stringify(calls === 1 ? [PET] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    render(
      <PetProvider>
        <Probe />
      </PetProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'));
    await userEvent.setup().click(screen.getByText('재확인'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'));
  });
});
