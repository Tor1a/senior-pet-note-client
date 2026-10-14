const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => mockGet(k),
  setItemAsync: (k: string, v: string) => mockSet(k, v),
  deleteItemAsync: jest.fn(),
}));

import { loadChecklist, saveChecklist } from './checklistStorage';

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
});

describe('checklistStorage', () => {
  it('저장 키는 spn.checklist 하나, 값은 {v:1,p}', async () => {
    mockSet.mockResolvedValue(undefined);
    await saveChecklist({ p1: ['prep.toy'] });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0][0]).toBe('spn.checklist');
    expect(JSON.parse(mockSet.mock.calls[0][1])).toEqual({ v: 1, p: { p1: ['prep.toy'] } });
  });

  it('저장된 값을 읽는다', async () => {
    mockGet.mockResolvedValue('{"v":1,"p":{"p1":["prep.toy"]}}');
    expect(await loadChecklist()).toEqual({ p1: ['prep.toy'] });
    expect(mockGet).toHaveBeenCalledWith('spn.checklist');
  });

  it('값이 없거나 손상됐으면 빈 상태', async () => {
    mockGet.mockResolvedValue(null);
    expect(await loadChecklist()).toEqual({});
    mockGet.mockResolvedValue('{깨짐');
    expect(await loadChecklist()).toEqual({});
  });

  it('읽기·쓰기가 던져도 던지지 않는다', async () => {
    mockGet.mockRejectedValue(new Error('locked'));
    mockSet.mockRejectedValue(new Error('locked'));
    expect(await loadChecklist()).toEqual({});
    await expect(saveChecklist({ p1: ['prep.toy'] })).resolves.toBeUndefined();
  });
});
