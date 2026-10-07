import { describe, expect, it } from 'vitest';
import { validatePhoto } from './photo';

describe('사진 확인', () => {
  it('형식·5MB 제한', () => {
    expect(validatePhoto({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(validatePhoto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toContain('5MB');
    expect(validatePhoto({ type: 'image/gif', size: 10 })).toContain('JPG');
  });
});
