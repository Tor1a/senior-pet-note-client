import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL, resolveApiConfig } from './config';

describe('resolveApiConfig — API 주소 환경변수 점검', () => {
  it('비어 있으면 기본값 http://localhost:8080', () => {
    expect(resolveApiConfig(undefined)).toEqual({ ok: true, baseUrl: DEFAULT_API_BASE_URL });
    expect(resolveApiConfig('  ')).toEqual({ ok: true, baseUrl: 'http://localhost:8080' });
  });

  it('끝의 / 를 떼어 낸다', () => {
    expect(resolveApiConfig('https://api.example.com/')).toEqual({ ok: true, baseUrl: 'https://api.example.com' });
  });

  it('주소 형식이 틀리거나 http(s) 가 아니면 거부', () => {
    expect(resolveApiConfig('localhost:8080 x')).toMatchObject({ ok: false, reason: 'invalid-url' });
    expect(resolveApiConfig('ftp://example.com')).toMatchObject({ ok: false, reason: 'invalid-url' });
  });
});
