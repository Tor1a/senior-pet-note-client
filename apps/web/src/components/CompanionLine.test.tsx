// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CompanionLine from './CompanionLine';

afterEach(cleanup);

describe('CompanionLine', () => {
  it('두 줄을 일반 단락으로 그린다(aria-live·role 없음)', () => {
    const { container } = render(
      <CompanionLine companion={{ togetherDays: 120, recordingDays: 45 }} name="보리" profileType="first_time" />,
    );
    const ps = container.querySelectorAll('p');
    expect([...ps].map((p) => p.textContent)).toEqual(['보리와 함께한 지 120일째', '기록을 시작한 지 45일째']);
    expect(container.querySelector('[aria-live],[role],[aria-label],[tabindex]')).toBeNull();
  });
  it.each([
    ['null', null, 'first_time'],
    ['senior', { togetherDays: 1, recordingDays: 1 }, 'senior'],
    ['유형 없음', { togetherDays: 1, recordingDays: 1 }, null],
    ['둘 다 0', { togetherDays: 0, recordingDays: 0 }, 'first_time'],
  ])('%s 이면 DOM 이 비어 있다', (_l, companion, type) => {
    const { container } = render(<CompanionLine companion={companion} name="보리" profileType={type} />);
    expect(container.innerHTML).toBe('');
  });
});
