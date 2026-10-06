import { PHOTO_MAX_BYTES, PHOTO_TYPES } from './constants';

/** 업로드 전에 사진을 확인한다. 문제가 있으면 안내 문구, 없으면 null (서버도 같은 규칙으로 다시 검사) */
export function validatePhoto(file: { type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'JPG, PNG, WEBP 사진만 올릴 수 있어요.';
  if (file.size > PHOTO_MAX_BYTES) return '사진이 너무 커요. 5MB 이하 사진을 골라 주세요.';
  return null;
}

/** 화면 안내 문구 */
export const PHOTO_HINT = 'JPG·PNG·WEBP, 5MB 이하';
