import { render, screen } from '@testing-library/react-native';
import { findCompanionForbidden } from '../../lib/companionText';
import { TodayHeader } from './TodayHeader';

const BOTH = { togetherDays: 120, recordingDays: 45 };

function header(props: Partial<React.ComponentProps<typeof TodayHeader>> = {}) {
  return <TodayHeader dateText="10월 14일 (수)" petName="보리" info="보리 · 개 · 14세" {...props} />;
}

describe('TodayHeader — 함께한 날 줄(E단계)', () => {
  it('first_time + 두 값: 두 줄을 한 묶음 라벨(보이는 문장과 같음)로 읽고 라이브 영역이 없다', async () => {
    await render(header({ companion: BOTH, profileType: 'first_time' }));
    expect(screen.getByText('보리와 함께한 지 120일째')).toBeTruthy();
    expect(screen.getByText('기록을 시작한 지 45일째')).toBeTruthy();
    const group = screen.getByLabelText('보리와 함께한 지 120일째, 기록을 시작한 지 45일째');
    expect(group.props.accessible).toBe(true);
    expect(group.props.accessibilityLiveRegion).toBeUndefined();
    expect(group.props.accessibilityLabel).not.toMatch(/[^가-힣0-9 ,]/);
    expect(findCompanionForbidden(group.props.accessibilityLabel)).toBeNull();
  });

  it('입양일 없음: 기록 줄만', async () => {
    await render(header({ companion: { togetherDays: null, recordingDays: 3 }, profileType: 'first_time' }));
    expect(screen.queryByText(/함께한/)).toBeNull();
    expect(screen.getByLabelText('기록을 시작한 지 3일째')).toBeTruthy();
  });

  it.each([
    ['senior', BOTH],
    [null, BOTH],
    [undefined, BOTH],
    ['first_time', null],
    ['first_time', undefined],
    ['first_time', { togetherDays: 0, recordingDays: null }],
  ])('profileType=%s companion=%j 이면 헤더 렌더 트리가 줄 없는 헤더와 같다', async (profileType, companion) => {
    const { toJSON } = await render(header());
    const base = JSON.stringify(toJSON());
    await screen.unmount();
    const again = await render(header({ companion: companion as never, profileType }));
    expect(JSON.stringify(again.toJSON())).toBe(base);
    expect(screen.queryByText(/일째/)).toBeNull();
  });

  it('글자 배율이 커져도 줄 수·고정 높이 제한이 없다', async () => {
    await render(header({ companion: BOTH, profileType: 'first_time' }));
    const el = screen.getByText('기록을 시작한 지 45일째');
    expect(el.props.numberOfLines).toBeUndefined();
    expect(el.props.adjustsFontSizeToFit).toBeUndefined();
  });
});
