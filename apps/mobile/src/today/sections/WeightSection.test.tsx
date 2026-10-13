import { render, screen } from '@testing-library/react-native';
import { WeightSection } from './WeightSection';

// 체중이 비면 − + [오늘 쟀어요] 가 비활성이므로 안내 문구가 그 버튼을 누르라고 하지 않는다(QA 웹 Playwright).
const base = { suggested: false, measured: false };

function ui(text: string) {
  return (
    <WeightSection
      weight={{ ...base, text }}
      lastWeight={null}
      recordDate="2026-10-06"
      onStep={jest.fn()}
      onChangeText={jest.fn()}
      onToggleMeasured={jest.fn()}
    />
  );
}

describe('WeightSection — 안내 문구', () => {
  it('체중이 비어 있으면 "체중을 적으면" 안내만 보인다', async () => {
    await render(ui(''));
    expect(screen.getByText('체중을 적으면 오늘 체중으로 저장돼요.')).toBeTruthy();
    expect(screen.queryByText(/\[오늘 쟀어요\]를 누르거나/)).toBeNull();
  });

  it('체중이 있으면 기존 안내가 그대로 보인다', async () => {
    await render(ui('4.35'));
    expect(screen.getByText('[오늘 쟀어요]를 누르거나 숫자를 바꾸면 오늘 체중으로 저장돼요.')).toBeTruthy();
  });
});
