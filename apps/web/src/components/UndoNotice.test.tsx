// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UndoNotice from './UndoNotice';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('UndoNotice', () => {
  it('자동으로 사라지는 안내는 정해진 시간 뒤 onDismiss 를 부른다', () => {
    const onDismiss = vi.fn();
    render(<UndoNotice message="결과예요" autoDismissMs={8000} onDismiss={onDismiss} />);
    act(() => void vi.advanceTimersByTime(7999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('마우스를 올리거나 포커스가 안에 있는 동안은 멈추고, 벗어나면 다시 센다', () => {
    const onDismiss = vi.fn();
    render(<UndoNotice message="결과예요" autoDismissMs={8000} onDismiss={onDismiss} onClose={() => {}} />);
    const box = screen.getByRole('status');
    fireEvent.mouseEnter(box);
    act(() => void vi.advanceTimersByTime(20000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(box);
    act(() => void vi.advanceTimersByTime(8000));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    onDismiss.mockClear();
    fireEvent.focus(screen.getByRole('button', { name: '닫기' }));
    act(() => void vi.advanceTimersByTime(20000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('안내 안의 버튼 사이로 Tab 이동할 때는 계속 멈추고, 포커스가 밖으로 나가야 다시 센다', () => {
    const onDismiss = vi.fn();
    render(<UndoNotice message="결과예요" autoDismissMs={8000} onDismiss={onDismiss} actionLabel="다시 체크" onAction={() => {}} onClose={() => {}} />);
    const action = screen.getByRole('button', { name: '다시 체크' });
    const close = screen.getByRole('button', { name: '닫기' });
    fireEvent.focus(action);
    fireEvent.blur(action, { relatedTarget: close }); // 안 → 안
    fireEvent.focus(close);
    act(() => void vi.advanceTimersByTime(30000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(close, { relatedTarget: document.body }); // 안 → 밖
    act(() => void vi.advanceTimersByTime(8000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('시간 제한이 없으면(되돌리기 버튼 안내) 사라지지 않고, Esc 로도 닫히지 않는다', () => {
    const onAction = vi.fn();
    render(<UndoNotice message="저장했어요" actionLabel="저장 되돌리기" onAction={onAction} onClose={() => {}} />);
    act(() => void vi.advanceTimersByTime(60000));
    fireEvent.keyDown(screen.getByRole('status'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '저장 되돌리기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('되돌리는 중에는 버튼 이름이 바뀌고 다시 눌러도 동작하지 않는다', () => {
    const onAction = vi.fn();
    render(<UndoNotice message="저장했어요" actionLabel="저장 되돌리기" busy busyLabel="되돌리는 중…" onAction={onAction} />);
    const btn = screen.getByRole('button', { name: '되돌리는 중…' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('실패 톤은 role=alert 로 읽힌다', () => {
    render(<UndoNotice message="되돌리지 못했어요" tone="error" />);
    expect(screen.getByRole('alert').textContent).toContain('되돌리지 못했어요');
  });
});
