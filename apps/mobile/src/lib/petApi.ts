// [공유 로직 사본] 원본: web/src/lib/petApi.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 반려동물·투약·"오늘" 화면 API (계약: projects/senior-pet-note/docs/api-today.md v1)
// - 기록 날짜(새벽 4시 규칙)와 제안값(최근 7일 평균)은 서버가 계산한다. 웹은 받은 값을 표시만 한다.
// - 계약을 바꾸려면 비서실장에게 먼저 알린다. 여기서 임의로 필드를 바꾸지 않는다.
import type { ApiClient } from './api';
import type { SymptomCode } from './symptoms';

export type Species = 'dog' | 'cat';

export interface Pet {
  id: string;
  name: string;
  species: Species;
  birthYear: number | null;
  conditions: string | null;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
}

/** POST /api/pets, PUT /api/pets/{id} 본문 */
export interface PetInput {
  name: string;
  species: Species;
  birthYear?: number | null;
  conditions?: string | null;
}

export interface Medication {
  id: string;
  petId: string;
  name: string;
  doseText: string | null;
  /** "HH:mm" 1~3개 */
  times: string[];
  active: boolean;
}

export interface MedicationInput {
  name: string;
  doseText?: string | null;
  times: string[];
}

export interface Dose {
  medicationId: string;
  name: string;
  doseText: string | null;
  scheduledTime: string;
  taken: boolean;
  medLogId: string | null;
  takenAt: string | null;
}

export interface DailyLogBody {
  foodLevel: number | null;
  waterLevel: number | null;
  waterMl: number | null;
  weightKg: number | null;
  symptoms: SymptomCode[];
  symptomsNone: boolean;
  symptomOther: string | null;
  memo: string;
}

export interface DailyLog extends DailyLogBody {
  id: string;
  petId: string;
  recordDate: string;
  updatedAt: string;
}

export interface Suggestions {
  foodLevel: number | null;
  waterLevel: number | null;
  waterMl: number | null;
  weightKg: number | null;
}

export interface TodayResponse {
  recordDate: string;
  cutoffNotice: string;
  doses: Dose[];
  dailyLog: DailyLog | null;
  suggestions: Suggestions;
  lastWeight: { weightKg: number; recordDate: string } | null;
}

export interface MedLog {
  id: string;
  medicationId: string;
  recordDate: string;
  scheduledTime: string;
  takenAt: string;
}

/** 지난 기록 보기 (계약: docs/api-history.md). 투약 횟수는 "현재 등록된 약 기준" 환산값 */
export interface HistoryMedication {
  scheduledCount: number;
  takenCount: number;
}

export interface HistoryDay {
  recordDate: string;
  /** 그날 기록이 없으면 null (0이나 "보통"으로 채우지 않는다) */
  dailyLog: DailyLog | null;
  medication: HistoryMedication;
}

export interface HistoryResponse {
  petId: string;
  from: string;
  to: string;
  /** 서버의 현재 기록 날짜 ("오늘(기록 중)" 판단에 쓴다) */
  recordDate: string;
  medicationBasis: 'current';
  /** from~to 모든 날짜가 오름차순으로 빠짐없이 들어 있다 */
  days: HistoryDay[];
}

/** MVP 허용 이벤트 이름 (계약 6장) */
export type EventName = 'today_opened' | 'med_checked' | 'daily_log_saved';

const enc = encodeURIComponent;

export function createPetApi(client: ApiClient) {
  return {
    listPets: () => client.request<Pet[]>('/api/pets'),
    createPet: (input: PetInput) => client.request<Pet>('/api/pets', { method: 'POST', body: input }),
    updatePet: (id: string, input: PetInput) =>
      client.request<Pet>(`/api/pets/${enc(id)}`, { method: 'PUT', body: input }),
    uploadPhoto: (id: string, file: Blob) => {
      const form = new FormData();
      form.append('file', file);
      return client.request<Pet>(`/api/pets/${enc(id)}/photo`, { method: 'PUT', body: form });
    },
    getPhoto: (id: string) => client.requestBlob(`/api/pets/${enc(id)}/photo`),
    deletePhoto: (id: string) => client.request<null>(`/api/pets/${enc(id)}/photo`, { method: 'DELETE' }),

    listMedications: (petId: string) => client.request<Medication[]>(`/api/pets/${enc(petId)}/medications`),
    createMedication: (petId: string, input: MedicationInput) =>
      client.request<Medication>(`/api/pets/${enc(petId)}/medications`, { method: 'POST', body: input }),
    updateMedication: (id: string, input: MedicationInput) =>
      client.request<Medication>(`/api/medications/${enc(id)}`, { method: 'PUT', body: input }),
    deleteMedication: (id: string) => client.request<null>(`/api/medications/${enc(id)}`, { method: 'DELETE' }),

    getToday: (petId: string) => client.request<TodayResponse>(`/api/pets/${enc(petId)}/today`),
    checkMed: (medicationId: string, scheduledTime: string) =>
      client.request<MedLog>('/api/med-logs', { method: 'POST', body: { medicationId, scheduledTime } }),
    uncheckMed: (medLogId: string) => client.request<null>(`/api/med-logs/${enc(medLogId)}`, { method: 'DELETE' }),
    saveDailyLog: (petId: string, recordDate: string, body: DailyLogBody) =>
      client.request<DailyLog>(`/api/pets/${enc(petId)}/daily-logs/${enc(recordDate)}`, { method: 'PUT', body }),

    /** 기간별 일일 기록. 기본은 파라미터 없이(서버가 "오늘"과 30일을 정한다). 하루 상세는 from=to=날짜 */
    getHistory: (petId: string, range: { from?: string; to?: string } = {}) => {
      const query = new URLSearchParams();
      if (range.from) query.set('from', range.from);
      if (range.to) query.set('to', range.to);
      const qs = query.toString();
      return client.request<HistoryResponse>(`/api/pets/${enc(petId)}/daily-logs${qs ? `?${qs}` : ''}`);
    },

    /**
     * 지표 이벤트. 실패해도(서버 꺼짐·401·400) 화면에 영향이 없도록 오류를 삼킨다.
     * 개인정보(이름·메모 등)는 props 에 넣지 않는다.
     */
    sendEvent: (name: EventName, props?: Record<string, string | number | boolean>): Promise<void> =>
      client
        .request<null>('/api/events', {
          method: 'POST',
          body: props ? { name, props } : { name },
          ignoreUnauthorized: true,
        })
        .then(
          () => undefined,
          () => undefined,
        ),
  };
}

export type PetApi = ReturnType<typeof createPetApi>;
