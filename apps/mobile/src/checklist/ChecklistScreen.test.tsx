import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import type { Pet } from '../lib/petApi';
import { CHECKLIST_TEXT } from '../lib/checklistText';
import { DISCLAIMER } from '../lib/constants';
import { setFontScale } from '../testing/fontScale';
import { PET } from '../testing/fixtures';
import ChecklistScreen from './ChecklistScreen';
import { ChecklistEntryCard } from './ChecklistEntryCard';

// 온보딩 F단계: 처음 키워요 체크리스트 화면·진입 카드
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
}));
const mockLoad = jest.fn();
const mockSave = jest.fn();
jest.mock('../services/checklistStorage', () => ({
  loadChecklist: () => mockLoad(),
  saveChecklist: (d: unknown) => mockSave(d),
}));

const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: () => () => {},
};

function ui(pet: Pet) {
  return (
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet, reload: jest.fn(), setPet: jest.fn() }}>
        <ChecklistScreen />
      </PetContext.Provider>
    </PushContext.Provider>
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockSave.mockReset();
  mockLoad.mockReset();
  mockLoad.mockResolvedValue({});
  mockSave.mockResolvedValue(undefined);
  setFontScale(1);
});

describe('체크리스트 화면', () => {
  it('고정 문구·저장 안내·면책이 있고 준비물 탭이 먼저 선택된다', async () => {
    await render(ui(PET));
    expect(screen.getByText(CHECKLIST_TEXT.notice)).toBeTruthy();
    expect(screen.getByText(CHECKLIST_TEXT.saveNote)).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.getByRole('tab', { name: '준비물' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('tab', { name: '병원에 물어볼 질문' }).props.accessibilityState.selected).toBe(false);
  });

  it('체크 행은 checkbox 역할·checked 상태이고 누르면 토글되며 저장한다', async () => {
    await render(ui(PET));
    const row = await screen.findByRole('checkbox', { name: '물그릇' });
    expect(row.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(row);
    expect(screen.getByRole('checkbox', { name: '물그릇' }).props.accessibilityState.checked).toBe(true);
    expect(mockSave).toHaveBeenLastCalledWith({ 'pet-1': ['prep.water_bowl'] });
    await fireEvent.press(screen.getByRole('checkbox', { name: '물그릇' }));
    expect(screen.getByRole('checkbox', { name: '물그릇' }).props.accessibilityState.checked).toBe(false);
  });

  it('저장된 체크를 불러온다', async () => {
    mockLoad.mockResolvedValue({ 'pet-1': ['prep.toy'] });
    await render(ui(PET));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '장난감' }).props.accessibilityState.checked).toBe(true));
  });

  it('질문 탭으로 바꾸면 질문이 보이고 종별 항목은 종에 맞는다', async () => {
    await render(ui(PET));
    expect(screen.getByRole('checkbox', { name: '목줄·하네스' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '스크래처' })).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: '병원에 물어볼 질문' }));
    expect(screen.getByRole('checkbox', { name: '산책은 어떻게 시작하면 되나요?' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '물그릇' })).toBeNull();
  });

  it('진행률·완료·알림 표현이 없다', async () => {
    await render(ui(PET));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '물그릇' }));
    expect(screen.queryByText(/\d+\s*\/\s*\d+|완료|달성|필수/)).toBeNull();
  });

  it('큰 글씨(2.0)에서도 모든 행이 있고 상태 글자가 보인다', async () => {
    setFontScale(2);
    await render(ui(PET));
    expect(screen.getAllByRole('checkbox').length).toBe(10);
    expect(screen.getAllByText(CHECKLIST_TEXT.unchecked).length).toBe(10);
  });
});

describe('체크리스트 저장 병합', () => {
  const press = async (name: string) => fireEvent.press(await screen.findByRole('checkbox', { name }));
  const isOn = (name: string) => screen.getByRole('checkbox', { name }).props.accessibilityState.checked;

  it('로드 완료 전에 체크해도 저장된 값과 합쳐진다', async () => {
    let resolve!: (d: Record<string, string[]>) => void;
    mockLoad.mockReset();
    mockLoad.mockImplementationOnce(() => new Promise((r) => (resolve = r))).mockResolvedValue({ 'pet-1': ['prep.toy'] });
    await render(ui(PET));
    await fireEvent.press(screen.getByRole('checkbox', { name: '물그릇' }));
    resolve({ 'pet-1': ['prep.toy'] });
    await waitFor(() => expect(isOn('물그릇')).toBe(true));
    expect(isOn('장난감')).toBe(true);
    expect(mockSave).toHaveBeenLastCalledWith({ 'pet-1': ['prep.toy', 'prep.water_bowl'] });
  });

  it('다른 petId 의 저장값을 보존한다', async () => {
    mockLoad.mockResolvedValue({ 'pet-9': ['prep.toy'] });
    await render(ui(PET));
    await press('물그릇');
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave).toHaveBeenLastCalledWith({ 'pet-9': ['prep.toy'], 'pet-1': ['prep.water_bowl'] });
  });

  it('저장소가 그 사이 바뀌어도 다시 읽어 병합한다', async () => {
    await render(ui(PET));
    await screen.findByRole('checkbox', { name: '물그릇' });
    mockLoad.mockResolvedValue({ 'pet-2': ['prep.toy'] });
    await press('물그릇');
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave).toHaveBeenLastCalledWith({ 'pet-2': ['prep.toy'], 'pet-1': ['prep.water_bowl'] });
  });

  it('읽기가 실패({})해도 화면의 체크가 유지된다', async () => {
    await render(ui(PET));
    await press('물그릇');
    await waitFor(() => expect(isOn('물그릇')).toBe(true));
    await press('장난감');
    await waitFor(() => expect(isOn('장난감')).toBe(true));
    expect(isOn('물그릇')).toBe(true);
    expect(mockSave).toHaveBeenLastCalledWith({ 'pet-1': ['prep.water_bowl', 'prep.toy'] });
  });

  it('pet.id 가 비어 있으면 저장하지 않는다', async () => {
    await render(ui({ ...PET, id: '' }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '물그릇' }));
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(mockSave).not.toHaveBeenCalled();
    expect(isOn('물그릇')).toBe(false);
  });

  it('반려동물별로 체크가 분리된다', async () => {
    mockLoad.mockResolvedValue({ 'pet-2': ['prep.water_bowl'] });
    await render(ui(PET));
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(isOn('물그릇')).toBe(false);
    await press('장난감');
    await waitFor(() => expect(isOn('장난감')).toBe(true));
    expect(mockSave).toHaveBeenLastCalledWith({ 'pet-2': ['prep.water_bowl'], 'pet-1': ['prep.toy'] });
  });
});

describe('진입 카드', () => {
  it('first_time 이면 접근성 이름이 있는 버튼으로 체크리스트를 연다', async () => {
    await render(<ChecklistEntryCard profileType="first_time" />);
    expect(screen.getByText('처음 키워요 체크리스트')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '처음 키워요 체크리스트 열기' }));
    expect(mockPush).toHaveBeenCalledWith('/checklist');
  });

  it.each([['senior'], [null], [undefined]])('profileType=%s 이면 아무것도 그리지 않는다', async (t) => {
    await render(<ChecklistEntryCard profileType={t as never} />);
    expect(screen.toJSON()).toBeNull();
  });
});
