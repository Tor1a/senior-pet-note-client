// 체크리스트 체크 상태를 이 기기(expo-secure-store)에 읽고 쓴다 (온보딩 F단계). 서버 전송 없음.
// 키는 spn.checklist 하나(JSON 한 덩어리, 체크된 항목 id 만). 읽기·쓰기가 실패해도 던지지 않는다:
// 읽기는 빈 상태, 쓰기는 조용히 무시(화면의 상태는 유지). 웹(개발 확인용)은 secure-store 가 없어 메모리에만 둔다.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { CHECKLIST_STORAGE_KEY, parseChecklist, serializeChecklist, type ChecklistData } from '../lib/checklistState';

const available = Platform.OS !== 'web';
let memory: string | null = null;

export async function loadChecklist(): Promise<ChecklistData> {
  try {
    const raw = available ? await SecureStore.getItemAsync(CHECKLIST_STORAGE_KEY) : memory;
    return parseChecklist(raw);
  } catch {
    return {};
  }
}

export async function saveChecklist(data: ChecklistData): Promise<void> {
  try {
    const raw = serializeChecklist(data);
    if (available) await SecureStore.setItemAsync(CHECKLIST_STORAGE_KEY, raw);
    else memory = raw;
  } catch {
    // 저장하지 못해도 화면은 계속 쓴다
  }
}
