import { fireEvent, render, screen } from '@testing-library/react-native';
import { toDoseViews } from '../../lib/todayDoses';
import { setFontScale } from '../../testing/fontScale';
import { DoseSection } from './DoseSection';

// QA B-2: 글자 200% 에서 "아조딜 1/2정" 이 "1 / 정" 처럼 단어 중간에서 끊기던 문제 → 큰 글씨에서는 이름과 용량을 줄로 나눈다.
const doses = toDoseViews([
  { medicationId: 'm1', name: '아조딜', doseText: '1/2정', scheduledTime: '08:00', taken: false, medLogId: null, takenAt: null },
  { medicationId: 'm2', name: '레나메진', doseText: null, scheduledTime: '21:00', taken: false, medLogId: null, takenAt: null },
]);

function ui(list = doses) {
  return (
    <DoseSection
      doses={list}
      cutoffNotice=""
      message={null}
      highlightKey={null}
      onToggle={jest.fn()}
      onHighlight={jest.fn()}
      onManage={jest.fn()}
      onHistory={jest.fn()}
      onAdd={jest.fn()}
    />
  );
}

describe('DoseSection — 이름과 용량 배치', () => {
  it('평소 글씨: 이름과 용량이 한 줄 문구 "아조딜 1/2정"', async () => {
    setFontScale(1);
    await render(ui());
    expect(screen.getByText('아조딜 1/2정')).toBeTruthy();
  });

  it('큰 글씨(2배): 이름과 용량이 따로 줄을 이룬다. 용량 없는 약은 이름만', async () => {
    setFontScale(2);
    await render(ui());
    expect(screen.getByText('아조딜')).toBeTruthy();
    expect(screen.getByText('1/2정')).toBeTruthy();
    expect(screen.queryByText('아조딜 1/2정')).toBeNull();
    expect(screen.getByText('레나메진')).toBeTruthy();
  });

  it('큰 글씨에서도 접근성 라벨은 한 문장이고 눌러서 체크할 수 있다', async () => {
    setFontScale(2);
    const onToggle = jest.fn();
    await render(
      <DoseSection doses={doses} cutoffNotice="" message={null} highlightKey={null} onToggle={onToggle} onHighlight={jest.fn()} onManage={jest.fn()} onHistory={jest.fn()} onAdd={jest.fn()} />,
    );
    await fireEvent.press(screen.getByRole('checkbox', { name: /아조딜 1\/2정, 아직 체크하지 않았어요/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('큰 글씨에서 접힌(먹임) 줄도 이름·용량·먹임을 줄로 나눈다', async () => {
    setFontScale(2);
    const taken = toDoseViews([{ ...doses[0], taken: true, takenAt: '2026-10-08T00:00:00Z' }]);
    await render(ui(taken));
    expect(screen.getByText('1/2정')).toBeTruthy();
    expect(screen.getByText(/아조딜$/)).toBeTruthy();
  });
});
