const mockSet = jest.fn();
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  setItemAsync: (k: string, v: string) => mockSet(k, v),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { getToken, saveToken } from './tokenStorage';

describe('saveToken', () => {
  it('저장소가 실패하면 던지고, 이번 실행에서는 새 토큰을 메모리에 쓴다', async () => {
    mockSet.mockRejectedValue(new Error('secure store'));
    await expect(saveToken('new')).rejects.toThrow();
    expect(getToken()).toBe('new');
  });
});
