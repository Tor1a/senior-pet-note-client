const mockDelete = jest.fn();
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: (k: string) => mockDelete(k),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import { clearPreferences } from './preferences';

describe('clearPreferences', () => {
  beforeEach(() => mockDelete.mockReset());

  it('물 입력 방식·푸시 기기 id·푸시 토큰 키를 모두 지운다', async () => {
    mockDelete.mockResolvedValue(undefined);
    await clearPreferences();
    expect(mockDelete.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['spn.pushDeviceId', 'spn.pushToken', 'spn.waterMode'].sort(),
    );
  });

  it('하나가 실패해도 나머지를 지우고 던지지 않는다', async () => {
    mockDelete.mockImplementation((k: string) => (k === 'spn.waterMode' ? Promise.reject(new Error('x')) : Promise.resolve()));
    await expect(clearPreferences()).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledTimes(3);
  });
});
