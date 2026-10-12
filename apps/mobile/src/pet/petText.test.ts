import { PET_FORM_ERRORS } from '../lib/petForm';
import { createdTitle, findPetForbidden, PET_TEXT, petSummary, remainingText, updatedTitle, yearText } from './petText';

describe('반려동물 화면 문구', () => {
  it('금지어(의료적 판단·평가·증감·퍼센트)가 하나도 없다', () => {
    expect(findPetForbidden()).toBeNull();
  });

  it('금지어 검사가 실제로 걸러 낸다(검사 자체가 죽어 있지 않은지)', () => {
    const { findForbidden } = require('../lib/historyText');
    expect(findForbidden('상태가 악화됐어요')).not.toBeNull();
    expect(findForbidden('체중이 늘었어요')).not.toBeNull();
  });

  it('설계 9-3 의 핵심 문구가 표와 같다', () => {
    expect(PET_TEXT.startButton).toBe('반려동물 등록하기');
    expect(PET_TEXT.newTitle).toBe('반려동물을 소개해 주세요');
    expect(PET_TEXT.editTitle).toBe('반려동물 정보');
    expect(PET_TEXT.limit).toBe('이미 등록된 반려동물이 있어요. 등록된 정보로 오늘 화면을 열었어요.');
    expect(PET_TEXT.gone).toBe('등록된 반려동물 정보를 찾지 못했어요. 다시 등록해 주세요.');
    expect(PET_TEXT.photoNote).toBe('사진은 지금은 웹에서만 바꿀 수 있어요.');
    expect(PET_FORM_ERRORS.nameRequired).toBe('이름을 적어 주세요.');
    expect(PET_FORM_ERRORS.speciesRequired).toBe('개인지 고양이인지 골라 주세요.');
    expect(createdTitle('보리')).toBe('보리를 등록했어요.');
    expect(updatedTitle('보리')).toBe('보리 정보를 고쳤어요.');
    expect(remainingText(20)).toBe('남은 글자 20자');
    expect(yearText(2012)).toBe('2012년');
  });

  it('등록 안내는 받침에 맞는 조사를 쓴다(받침 있음 을, 없음 를, 한글이 아니면 를)', () => {
    expect(createdTitle('밤')).toBe('밤을 등록했어요.');
    expect(createdTitle('콩이')).toBe('콩이를 등록했어요.');
    expect(createdTitle('Coco')).toBe('Coco를 등록했어요.');
    expect(createdTitle('밤')).not.toMatch(/\(/);
  });

  it('계정 카드 한 줄: 해가 있으면 "종류 · N년생", 없으면 종류만', () => {
    expect(petSummary('dog', 2012)).toBe('개 · 2012년생');
    expect(petSummary('cat', null)).toBe('고양이');
  });

  it('사진을 만들지 않는 1단계라 사진 선택·업로드 문구가 없다', () => {
    const all = Object.values(PET_TEXT).join('\n');
    expect(all).not.toMatch(/사진 고르기|올리는 중|사진 지우기|5MB/);
  });
});
