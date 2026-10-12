import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { setFontScale } from '../testing/fontScale';
import { UndoNotice } from './UndoNotice';

beforeEach(() => {
  jest.useFakeTimers();
  setFontScale(1);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
afterAll(() => setFontScale(2));

describe('UndoNotice (모바일)', () => {
  it('자동으로 사라지는 안내는 정해진 시간 뒤 onDismiss 를 부른다', async () => {
    const onDismiss = jest.fn();
    await render(<UndoNotice message="결과예요" autoDismissMs={8000} onDismiss={onDismiss} />);
    await act(async () => void jest.advanceTimersByTime(7999));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('화면에 손을 대고 있는 동안은 멈춘다', async () => {
    const onDismiss = jest.fn();
    await render(<UndoNotice message="결과예요" autoDismissMs={8000} onDismiss={onDismiss} />);
    const box = screen.getByText(/결과예요/);
    await fireEvent(box, 'touchStart');
    await act(async () => void jest.advanceTimersByTime(20000));
    expect(onDismiss).not.toHaveBeenCalled();
    await fireEvent(box, 'touchEnd');
    await act(async () => void jest.advanceTimersByTime(8000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('스크린리더가 켜져 있으면 자동으로 사라지지 않고 [닫기]가 생긴다', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onDismiss = jest.fn();
    await render(<UndoNotice message="아조딜 체크를 되돌렸어요." actionLabel="다시 체크" onAction={() => {}} autoDismissMs={10000} onDismiss={onDismiss} />);
    await act(async () => void jest.advanceTimersByTime(60000));
    expect(onDismiss).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('시간 제한이 없는 되돌리기 안내는 사라지지 않고, 되돌리는 중에는 다시 눌러도 동작하지 않는다', async () => {
    const onAction = jest.fn();
    const view = await render(<UndoNotice message="저장했어요" actionLabel="저장 되돌리기" onAction={onAction} onClose={() => {}} />);
    await act(async () => void jest.advanceTimersByTime(60000));
    await fireEvent.press(screen.getByRole('button', { name: '저장 되돌리기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await view.rerender(<UndoNotice message="저장했어요" actionLabel="저장 되돌리기" busy busyLabel="되돌리는 중…" onAction={onAction} />);
    await fireEvent.press(screen.getByRole('button', { name: '되돌리는 중…' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('실패 톤은 ⓘ 안내 카드로 보여 준다(✓ 없음)', async () => {
    await render(<UndoNotice message="되돌리지 못했어요" tone="error" />);
    expect(screen.getByText('ⓘ 안내')).toBeTruthy();
    expect(screen.getByText('되돌리지 못했어요')).toBeTruthy();
  });
});
