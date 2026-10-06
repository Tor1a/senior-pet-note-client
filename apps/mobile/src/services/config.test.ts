// API 주소 설정(resolveApiConfig) 테스트
import { DEFAULT_API_BASE_URL, resolveApiConfig } from './config';

describe('resolveApiConfig', () => {
  it('비어 있으면 플랫폼별 기본값 (안드로이드 에뮬레이터는 10.0.2.2)', () => {
    expect(resolveApiConfig(undefined, 'android')).toEqual({ ok: true, baseUrl: DEFAULT_API_BASE_URL.android });
    expect(resolveApiConfig('  ', 'ios')).toEqual({ ok: true, baseUrl: 'http://localhost:8080' });
  });

  it('LAN IP 주소를 그대로 쓰고 끝의 / 는 뗀다', () => {
    expect(resolveApiConfig('http://192.168.0.10:8080/', 'android')).toEqual({
      ok: true,
      baseUrl: 'http://192.168.0.10:8080',
    });
  });

  it('형식이 잘못되면 ok: false', () => {
    expect(resolveApiConfig('not a url', 'ios').ok).toBe(false);
    expect(resolveApiConfig('ftp://x.com', 'ios').ok).toBe(false);
  });
});
