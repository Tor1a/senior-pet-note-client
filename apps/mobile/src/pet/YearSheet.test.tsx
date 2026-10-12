import { initialSheetYear } from './YearSheet';

describe('initialSheetYear', () => {
  it('고른 해가 있으면 그 해, 없으면 올해 − 12년, 1980 아래로는 내려가지 않는다', () => {
    expect(initialSheetYear(2012, 2026)).toBe(2012);
    expect(initialSheetYear(null, 2026)).toBe(2014);
    expect(initialSheetYear(null, 1985)).toBe(1980);
  });
});
