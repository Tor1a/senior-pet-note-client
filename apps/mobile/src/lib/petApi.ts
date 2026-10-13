// [공유 로직 사본] 원본: web/src/lib/petApi.ts (2026-10-13 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 반려동물·투약·"오늘" 화면 API (계약: projects/senior-pet-note/docs/api-today.md v1)
// - 기록 날짜(새벽 4시 규칙)와 제안값(최근 7일 평균)은 서버가 계산한다. 웹은 받은 값을 표시만 한다.
// - 계약을 바꾸려면 비서실장에게 먼저 알린다. 여기서 임의로 필드를 바꾸지 않는다.
import type { ApiClient } from './api';
import type { PetProfileType } from './petProfile';
import type { SymptomCode } from './symptoms';

export type Species = 'dog' | 'cat';
export type { PetProfileType } from './petProfile';

export interface Pet {
  id: string;
  name: string;
  species: Species;
  birthYear: number | null;
  conditions: string | null;
  hasPhoto: boolean;
  /**
   * 유형·생일·입양일(계약 docs/api-pet-profile.md). 응답에는 항상 있고 값이 없으면 null.
   * 옛 서버 응답에는 키가 없을 수 있어 읽는 쪽은 ?? null 로 읽는다.
   */
  profileType?: PetProfileType | null;
  /** "YYYY-MM-DD" 달력 날짜 */
  birthDate?: string | null;
  adoptedOn?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * POST /api/pets, PUT /api/pets/{id} 본문
 * profileType·birthDate·adoptedOn: 생략 = 서버가 기존 값 유지, null = 지움 (name·species·birthYear·conditions 는 전체 교체)
 */
export interface PetInput {
  name: string;
  species: Species;
  birthYear?: number | null;
  conditions?: string | null;
  profileType?: PetProfileType | null;
  birthDate?: string | null;
  adoptedOn?: string | null;
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
  /**
   * 루틴 기록(산책·배변 횟수, 계약 docs/api-routine.md): 0~20 정수, null = 안 적음.
   * PUT 요청에서 생략하면 서버가 기존 값을 유지하고, null 을 보내면 지운다. 응답에 없으면(구버전 서버) null 로 읽는다.
   */
  walkCount?: number | null;
  poopCount?: number | null;
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
    /** 오늘 기록 삭제(저장 되돌리기). 기록이 없어도 204. 서버가 말하는 현재 기록 날짜만 지울 수 있다(아니면 400 INVALID_RECORD_DATE) */
    deleteDailyLog: (petId: string, recordDate: string) =>
      client.request<null>(`/api/pets/${enc(petId)}/daily-logs/${enc(recordDate)}`, { method: 'DELETE' }),

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
