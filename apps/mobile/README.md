# 오래곁 모바일 앱 (React Native 뼈대)

Expo SDK 57 + TypeScript + Expo Router. 본격 개발은 웹 MVP 검증 후(2~3개월 차)에 하며,
"오늘" 화면(투약 체크·식사·물·증상·체중·메모·저장)과 "약 관리 + 알림 설정" 화면(약 등록·수정·삭제, 약별 알림 규칙)까지 구현했다.
웹과 같은 기능이며 웹에 없는 기능은 없다.

## 폴더 구조
```
mobile/
├─ app.config.ts         Expo 설정 (이름, scheme, 플러그인. Firebase 설정 파일이 있을 때만 RNFB 플러그인 추가)
├─ .env.example          환경변수 예시 → .env 로 복사해서 사용
├─ src/
│  ├─ app/               화면(Expo Router: 파일 하나 = 화면 하나)
│  │  ├─ _layout.tsx     로그인 상태에 따라 화면 접근 제어(Stack.Protected)
│  │  ├─ index.tsx       "오늘" 라우트(PetGate → TodayScreen). 얇게 유지
│  │  ├─ login.tsx       로그인
│  │  ├─ signup.tsx      회원가입
│  │  ├─ pet/            new.tsx(/pet/new 등록, PetGate 밖) · edit.tsx(/pet/edit?from=today|medications|account 수정, PetGate 안)
│  │  └─ medications/    약 관리 라우트(모두 PetGate → 화면, 얇게 유지)
│  │     ├─ index.tsx            /medications            약 목록
│  │     ├─ new.tsx              /medications/new        약 등록
│  │     └─ [id]/edit.tsx · reminder.tsx   /medications/<id>/edit(수정, 알림 설정에서 오면 ?from=reminder) · /medications/<id>/reminder(알림 설정)
│  ├─ medications/       MedicationsScreen(목록·삭제·알림 상태 줄), MedicationFormScreen(등록·수정), ReminderScreen(알림 설정),
│  │                     sections/(MedicationCard·ReminderStatusLine·TimeRow·SwitchRow·RepeatSection·PeriodSection·DeviceCard·PermissionModal),
│  │                     routes.ts(경로·안내 코드), layout.ts(큰 글씨 배치 기준), useLeaveGuard.ts(저장 안 한 변경 확인), ScreenTop.tsx
│  ├─ pet/               PetProvider(GET /api/pets 첫 번째 + setPet), PetGate(없음→PetStart·오류·로딩), PetStart(시작 화면), PetFormScreen(등록·수정 폼),
│  │                     YearSheet(태어난 해 목록 시트), PetAvatar(이름 첫 글자 원), PetNotices·usePetNotice(돌아온 뒤 안내 카드), petText(문구·금지어 검사), routes.ts
│  ├─ today/             TodayScreen(상태·API·타이머·AppState) + sections/(표시 전용: 헤더·투약·식사/물·증상·체중·메모·저장 바·알림 카드/로그아웃)
│  ├─ push/              pushContext.ts(Context·usePush·usePushMessages·bannerVisible), PushProvider.tsx(배너)
│  ├─ testing/           컴포넌트 테스트용 가짜 client·계약 예시 JSON
│  ├─ auth/AuthContext.tsx   로그인 상태(loading / signedOut / signedIn)
│  ├─ components/        공통 UI(ui.tsx: 접근성 기본값 강제), NoticeCard, DateTimeField(날짜·시각 선택기), 로그인 폼
│  ├─ services/          모바일 전용: API 주소 설정, 토큰 저장(expo-secure-store), API 클라이언트 연결,
│  │                     datePickerValue(선택기 Date ↔ 'YYYY-MM-DD'/'HH:mm', 로컬 getter 만 사용), openAppSettings(설정 열기)
│  ├─ lib/               웹 src/lib 원본과 같은 공통 로직 "사본"(헤더 주석만 다름. 아래 '공유 패키지 통합 계획' 참고)
│  └─ theme.ts           색·글자 크기·터치 영역 수치
```
화면이 아닌 코드는 `src/app/` 밖에 둔다(Expo Router 가 `src/app/` 안의 파일을 모두 화면으로 본다).

## 준비
- Node.js 20 이상 (확인한 버전: v24)
- `npm install`
- 환경변수: `.env.example` 을 `.env` 로 복사하고 `EXPO_PUBLIC_API_BASE_URL` 을 고친다. 개인정보 처리방침 주소 `EXPO_PUBLIC_PRIVACY_POLICY_URL`(비우면 계정·탈퇴 화면의 링크 줄이 숨겨진다. 스토어 심사 전 설정 필요).

| 실행 환경 | EXPO_PUBLIC_API_BASE_URL |
|-----------|--------------------------|
| 안드로이드 에뮬레이터 | `http://10.0.2.2:8080` (에뮬레이터에서 PC 의 localhost) |
| iOS 시뮬레이터(맥 필요)·웹 | `http://localhost:8080` |
| 실기기(Expo Go) | PC 의 LAN IP. 예: `http://192.168.0.10:8080` (`ipconfig` 의 IPv4 주소. 같은 Wi-Fi + Windows 방화벽 8080 허용 필요) |

- 비워 두면 안드로이드는 `10.0.2.2:8080`, 나머지는 `localhost:8080` 을 쓴다.
- `.env` 를 고친 뒤에는 `npx expo start -c` 로 캐시를 지우고 다시 시작한다.
- `EXPO_PUBLIC_` 값은 앱 안에 그대로 들어가므로 비밀값을 넣지 않는다.
- 백엔드(별도 저장소 `senior-pet-note-api`)가 켜져 있어야 로그인이 된다. 꺼져 있으면 "서버에 연결할 수 없어요" 문구가 나온다.

## 실행
| 방법 | 명령 | 비고 |
|------|------|------|
| Expo Go (실기기) | `npm start` → 휴대폰 Expo Go 앱으로 QR 스캔 | 무료. 계정 가입 없이 가능. 앱 스토어/플레이 스토어에서 Expo Go 설치 |
| 안드로이드 에뮬레이터 | 에뮬레이터를 켠 뒤 `npm run android` | Android Studio 의 AVD 필요 |
| iOS 시뮬레이터 | `npm run ios` | macOS + Xcode 필요 (대표 PC 는 Windows 라 불가) |
| 웹(화면 확인용) | `npm run web` | 웹에서는 secure-store 가 없어 토큰을 메모리에만 둔다(새로고침 시 로그아웃) |

## 검증 명령
```
npm run typecheck      # npx tsc --noEmit
npm test               # Jest (jest-expo): 공통 로직 사본(웹 테스트 사본) + API 주소 설정 테스트
npx expo-doctor        # 설정·의존성 버전 점검
npx expo export --platform web   # 번들 생성 확인 (결과물 dist/ 는 git 제외)
```
- 패키지는 `npm install` 대신 `npx expo install <패키지>` 로 추가한다(SDK 에 맞는 버전을 골라 줌).

## 접근성 기본값 (design/today-wireframe.md 5-1, 5-2)
- 본문 18, 보조 문구 14, 제목 24. 기기 글자 크기 설정을 따른다(화면은 스크롤되어 200% 에서도 잘리지 않게).
- 모든 터치 요소 최소 48×48, 주요 버튼 높이 56, 버튼 간격 8.
- 색은 `theme.ts` 의 임시 색상. 빨강을 쓰지 않고, 오류도 색만이 아니라 글자로 알린다.
- 새 화면은 RN 기본 `Text`/`Pressable` 대신 `components/ui.tsx` 의 `AppText`, `AppButton`, `TextField` 를 쓴다.

## 약 관리·알림 설정 (2026-10-08)
- 오늘 화면의 [약 관리 ›](투약 목록 아래), 약 없음 카드의 [약 등록하기], 맨 아래 [약 관리 · 알림 설정] 에서 들어간다. 기존 [알림 받기](권한 요청) 카드는 그대로 두었다.
- 약 목록(`/medications`): 약마다 알림 상태 줄("▣ 알림 켜짐 · 월·수" / "□ 알림 꺼짐", 이모지 대신 글자·기호)과 [고치기]·[알림 설정]·목록에서 빼기(인라인 확인). 약이 0개면 빈 상태 카드.
- 알림 설정(`/medications/<id>/reminder`): 켜기/끄기, 반복 3종, 요일, 간격 스테퍼, 시작·종료일, 요약·다음 알림(서버 값), [저장]을 눌러야 확정.
  저장할 때 권한이 `default` 면 사전 안내(Modal) → [알림 허용하기]에서만 OS 권한 창. 거부(`denied`)면 저장은 되고 안내 카드의 [설정 열기]로 휴대폰 설정을 연다.
  설정에서 허용하고 돌아오면(앱이 다시 앞으로 오면) `PushProvider` 가 권한을 다시 확인해 "이제 이 기기에서도 알림을 받아요."를 보여 준다(default/denied/error 일 때만).
- 저장 안 한 변경이 있을 때 화면 안 [← 약 목록으로]·[먹이는 시각 바꾸기 ›]·시스템 뒤로가기(Android 뒤로, iOS 스와이프)는 확인 카드를 거친다(`beforeRemove` 가로채기, `medications/useLeaveGuard.ts`).
- 날짜·시각 선택은 `@react-native-community/datetimepicker` 9.1.0(SDK 57 번들 버전). Android 는 시스템 대화상자, iOS 는 하단 시트(휠/달력)에서 [완료]를 눌러야 반영된다. 웹 미리보기에서는 글자 입력칸으로 대신한다.
- **네이티브 모듈이 추가됐으므로 개발 빌드를 한 번 다시 만들어야 한다**(Expo Go 에는 포함돼 있어 그대로 된다): `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`(macOS, JDK 25 는 CMake 단계에서 실패) 후 `CI=1 npx expo run:android`(Windows 는 JDK 21 경로를 `JAVA_HOME` 으로). 이 PC 에서 로컬로만 빌드하며 EAS 는 쓰지 않았다.
- 화면 사이 안내는 라우트 파라미터 `notice` 에 고정 코드(created/updated/gone)만 싣고, 약 이름은 목록이 불러온 목록에서 `medId` 로 찾는다.
- 알려진 한계: iOS 확인 못 함(장비 없음). Android 에뮬레이터에서 글자 200% 화면은 눈으로 확인했으나 TalkBack 등 스크린리더 동작은 미확인. 온보딩(`?onboarding=1`)은 만들지 않았다(반려동물 등록 후에는 오늘 화면의 약 등록 안내 카드로 잇는다).

## 반려동물 등록·수정 — 1단계, 사진 제외 (2026-10-12)
- 설계 `.company/design/모바일-반려동물-등록.md`, 기획 `.company/plans/모바일-반려동물-등록.md`. 백엔드 변경 없음(`POST/PUT/GET /api/pets` 기존).
- 반려동물이 없으면 `PetGate` 가 모든 화면(오늘·약 관리·지난 기록·리포트)에서 같은 **시작 화면**(`PetStart`: [반려동물 등록하기], 웹에서 이미 등록했다면 [다시 확인하기], [계정], [로그아웃])을 보인다. 알림 받기 카드는 숨긴다(`DeviceFooter compact`).
- 등록 `/pet/new`(PetGate 밖): 이름(1~30자)·종류(큰 버튼 2개, 기본 선택 없음)·태어난 해(목록 시트 + [완료]/[취소], 새 네이티브 모듈 없음)·앓고 있는 질환(200자, 줄바꿈은 공백으로). 성공하면 오늘로 `dismissTo`(폼이 스택에 안 남음) + "OO를/을 등록했어요."(`withParticle` 로 받침에 맞는 조사) 카드와 약 등록 안내(한 번만, 닫으면 끝). 웹의 약 관리 2/2 온보딩은 만들지 않았다.
- 리뷰·QA 수정(2026-10-12): (1) `/pet/new` 직접 진입(콜드 스타트·딥링크)은 반려동물 확인 중(`loading`)이면 로딩만 보이고, 이미 있으면(`ready`) 폼 없이 오늘로 `replace`, `none`·`offline`·`error` 로 확정된 뒤에만 폼. (2) 저장 중 시스템 뒤로·스와이프는 확인 카드 없이 막기만 한다(`useLeaveGuard(dirty, blocked)`). (3) 409/404 뒤 `PetProvider.reload({ keepOnError })` 가 성공 여부(boolean)를 돌려주고, 실패하면 이동하지 않고 폼에 머물며 "반려동물 정보를 다시 확인하지 못했어요." + [다시 시도](저장을 되풀이하지 않고 다시 읽기만). (4) "빠진 곳이 있어요" 요약은 칸별 오류를 모두 고치면 사라진다. (5) 수정·이미 등록됨·정보 없음 안내 카드에 [닫기]가 있다. 약 이름이 들어가는 약 관리 쪽 `을(를)` 문구는 이번 범위 밖이라 그대로다.
- 수정 `/pet/edit?from=…`: 오늘 맨 아래 [반려동물 정보], 약 관리 제목 아래 줄 [정보 고치기 ›], 계정 맨 위 `반려동물` 카드의 [정보 고치기]. 저장하면 들어왔던 화면으로 돌아가 "OO 정보를 고쳤어요." 카드. 고친 채 뒤로·스와이프·버튼으로 나가면 "저장하지 않고 나갈까요?"(`useLeaveGuard`).
- 오류: 이름/종류 빠짐은 칸 아래 `! 문구` + 버튼 위 요약, 400·연결 실패는 기존 `toUserMessage(…,'pet')` + "입력한 내용은 그대로 있어요.", 409 `PET_LIMIT_REACHED` 는 다시 읽고 오늘로 + "이미 등록된 반려동물이 있어요…", 수정 중 404 는 시작 화면 + "등록된 반려동물 정보를 찾지 못했어요…". 401 은 조용히(AuthContext 가 로그인 화면으로). 저장 중에는 입력·뒤로 잠금, 중복 제출은 `useRef` 가드.
- 화면 사이 안내는 `notice` 파라미터에 고정 코드(`petCreated`/`petUpdated`/`petLimit`/`petGone`)만 싣고, 이름은 `PetProvider` 의 pet 에서 읽는다(앱을 다시 열면 사라짐). 약 관리의 `created/updated/gone` 과 섞이지 않는다.
- 공유 사본 `lib/petForm.ts`(검증·본문 변환·오류 분류, 웹 `PetFormPage` 에서 추출) + 테스트. 문구는 모바일 전용 `pet/petText.ts`(금지어 검사 `findPetForbidden()`).
- **사진은 2단계로 보류**: 사진 선택·업로드·표시·삭제는 만들지 않았다(`expo-image-picker` 미설치, `Image` 로 인증 사진 표시 안 함). 웹에서 올린 사진도 앱에서는 이름 첫 글자 원으로 보이고, 수정 폼에 "사진은 지금은 웹에서만 바꿀 수 있어요." 한 줄이 있다. 2단계는 `PetAvatar` 안쪽과 `PetFormScreen` 의 `PHOTO_SLOT` 자리만 바꾸면 되며, **`expo-image-picker` 설치(네이티브)와 개발 빌드 재생성이 필요해 대표님 승인 후** 진행한다.
- 확인하지 못한 것(실기기 필요, 2단계 7개 항목과 함께 보류): 화면은 jest 로만 확인했다. 실제 키보드 동작·글자 200% 모양·VoiceOver/TalkBack 읽기·태어난 해 시트 스크롤 위치·iOS.

## 지난 기록 보기·체중 그래프 (2026-10-08)
- 오늘 화면의 [약 관리 ›] 옆 [지난 기록 보기 ›](약이 없어도 보임, 글자 1.3배 이상이면 세로로 쌓임)에서 들어간다. 라우트: `/history`(H1), `/history/[recordDate]`(H2, 읽기 전용, 전날/다음 날은 `replace`).
- 서버 `GET /api/pets/{petId}/daily-logs`(계약: 백엔드 `docs/api-history.md`)를 **파라미터 없이 한 번** 호출해 30일치를 받고, 7일/30일 전환은 화면에서 자른다(재요청 없음, 기본 30일). H2 는 `from=to=날짜`.
- 공유 사본: `lib/petApi.ts`(HistoryResponse·getHistory), `historyStats.ts`, `chartGeometry.ts`, `historyText.ts`(+금지어 검사), `historyFixtures.ts`(테스트 보조). 화면·그래프(`src/history/`)는 모바일 전용.
- 그래프는 `react-native-svg` 15.15.4(SDK 57 번들 버전, `npx expo install react-native-svg`). 선·점만 SVG 로 그리고 축 숫자는 RN 글자라 글자 크기 설정을 따른다. 스크린리더에는 그래프 전체가 요약 문장 하나로 읽힌다.
- 표 보기: [표로 보기]로 날짜별 행 목록(날짜·체중·증상). **스크린리더가 켜져 있거나 글자 배율 2.0 이상이면 표 보기가 기본**이다.
- 오프라인: 이미 불러온 내용은 메모리에서 그대로 보여 주고 "마지막으로 불러온 시각: 오후 3:20 · 지금은 연결이 끊겨 있어요."를 알린다. **디스크에는 저장하지 않는다**(앱을 다시 켜면 사라짐). [새로 불러오기]·당겨서 새로고침으로 다시 읽는다.
- **`react-native-svg` 는 네이티브 모듈이라 개발 빌드를 한 번 다시 만들어야 한다**: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` 후 `CI=1 npx expo run:android`(JDK 25 금지). Expo Go 에는 포함돼 있다고 알려져 있으나 이번에 Expo Go 실기기 구동은 **확인하지 못했다**(푸시 때문에 개발 빌드가 기준).
- Jest 에서는 `react-native-svg` 를 가벼운 껍데기로 바꿔 쓰고(좌표 계산은 `chartGeometry` 테스트가 보장), 그래프의 실제 그리기는 에뮬레이터에서 눈으로 확인했다.

## 병원 방문 리포트 (2026-10-08)
- 라우트 `/report`(`src/app/report/index.tsx` -> `src/report/ReportScreen.tsx`, 카드 `ReportCards.tsx`). 오늘 화면 맨 아래 `병원 방문 리포트` 카드의 [리포트 보기], 지난 기록 화면 기간 아래 [병원 방문 리포트 만들기 ›](`?range=7|30&from=history` 로 기간을 이어받고 돌아오기는 지난 기록)에서 들어간다.
- 신규 API 없음: 지난 기록과 같은 `GET daily-logs`(파라미터 없이 1번) + `GET medications` 로 만들고 7/14/30일(기본 14일) 전환은 화면에서 자른다. 기간·메모 옵션은 저장하지 않는다.
- 공유 사본: `lib/reportStats.ts`, `lib/reportText.ts`(+ 테스트). 웹 원본을 먼저 고치고 복사한다(헤더 3줄 외 diff 없음). 화면은 모바일 전용.
- 내보내기는 RN 기본 `Share.share({ message })` **텍스트만**. 새 네이티브 모듈 없음 -> **개발 빌드 재생성 불필요**(JS 변경만). 파일·클립보드·이미지 생성 없음. 공유 전 확인 카드(담기는 내용 미리보기, 메모 포함 스위치 기본 켜짐, "건강 기록이 선택한 앱으로 전달돼요.")를 거친다. 기록 0일이면 공유 비활성 + 이유 글자. Expo 웹 미리보기에서는 공유 대신 `공유는 앱에서 할 수 있어요.`.
- 큰 글씨: 1.3배 이상 표 행을 세로 배치, 2.0배 이상 또는 스크린리더가 켜져 있으면 날짜별 체중 표가 기본 펼침(그 외 접힘). 그래프는 한 덩어리 접근성 요소(요약 문장) + 아래 표/행 목록이 값을 읽어 준다. 요약 문장은 항상 그래프보다 위.
- 확인하지 못한 것: 에뮬레이터·실기기에서의 화면/공유 시트 동작(Jest 컴포넌트 테스트와 `expo export --platform web` 번들만 확인), iOS, TalkBack/VoiceOver 실제 읽기 순서.

## 저장 되돌리기·실수 방지 (2026-10-12)
웹과 같은 규칙(웹 README 참고). 공유 사본 `lib/undoLogic·undoText·todayForm(isFormDirty)·petApi(deleteDailyLog)`(+테스트 `undoLogic·undoText·formDirty`). 앱 전용 부품 `components/UndoNotice`·`ConfirmCard`, `today/sections/WeightConfirm`.
- 투약 접힌 줄은 `되돌리기` 버튼만 반응, 되돌린 직후 `다시 체크` 안내(10초, 스크린리더가 켜져 있으면 닫을 때까지 유지).
- 일일 기록 저장 직후 `저장 되돌리기`: `SaveBar` 안에 표시, 글자 배율 1.3 이상이면 스크롤 맨 위로 옮기고 저장 막대에는 버튼만(움직임 줄이기 설정이면 즉시 이동). 결과 안내 8초. 저장 중에는 `저장 되돌리기` 버튼이 비활성(접근성 disabled 상태)이고 "저장하는 중에는 되돌릴 수 없어요." 문구를 보인다. 저장이 끝나면 새 저장 기준 안내로 교체된다.
- 체중 자릿수 확인 카드(지난 기록의 5배 이상·1/5 이하).
- 모바일 이탈 확인은 넣지 않았다(화면이 쌓여 입력이 유지됨, 기획 Q8). `AppInput` 에 `inputRef` 추가.
- 에뮬레이터에서 실제 화면은 확인하지 못했다(Metro 번들이 25%에서 멈춤). 실기기·TalkBack 확인 필요.

## 알림에서 바로 체크 — 대체 흐름 (2026-10-12)
기획 `.company/plans/알림-바로-체크.md`, 설계 `.company/design/알림-바로-체크.md` 6장(+맨 끝 "설계와 달라진 점"). **모바일 앱은 알림 버튼(Android 액션)을 만들지 않았다**(기획 Q1: 실기기·네이티브 모듈 검증 불가). 웹 서비스워커의 알림 버튼·토큰 사본(IndexedDB)은 웹 전용이며 모바일에는 해당 없다(토큰은 `expo-secure-store` 그대로). 모바일은 알림을 눌러 연 오늘 화면의 큰 [먹였어요] 흐름만 쓴다. iOS 도 같은 흐름이 유일한 경로다.
- 알림 탭·인앱 배너 [오늘 화면에서 체크하기]는 `router.dismissTo('/?source=push&med=<약>&t=<시각>&d=<기록 날짜>&n=<열 때마다 바뀌는 값>')` 로 간다(`push/pushContext.todayPushHref`, 쿼리 조각은 공유 사본 `lib/reminderApi.medTargetQuery`).
- **회차 매칭(공유 사본 `lib/todayDoses.decidePushHold`)**: 약·시각이 모두 맞는 회차 카드만 맨 위로 올리고 강조(테두리 + "방금 알림 온 약")하며 카드 아래에 폭 전체의 큰 [먹였어요]를 붙인다(라벨 "{약 이름} {용량} {시각} 먹였어요 체크"). 같은 약의 다른 회차에는 붙지 않는다. `d` 가 오늘 응답의 `recordDate` 와 다르면(어제 알림) 강조·큰 버튼·순서 변경이 없다. `t` 가 없는 옛 알림은 아직 안 먹인 첫 회차를 강조만 한다(큰 버튼 없음).
- **고정**: 처음 정한 회차에 고정한다(렌더마다 같은 약의 "다음 안 먹인 회차"를 다시 고르지 않음). 체크하면 강조가 풀리고 줄이 접히며 큰 버튼도 사라지고 다음 회차로 옮겨 가지 않는다(되돌리면 다시 보임). 알림을 다시 열면(`n` 변경) 다시 고른다.
- **레이아웃**: 2분 강조가 끝나도 큰 버튼은 남는다(카드 높이가 바뀌지 않게). 체크 직후 줄이 접힐 때까지(0.3초) 큰 버튼은 비활성으로 남고, 접힌 뒤 스크린리더 포커스는 [되돌리기]로 간다.
- 문구는 공유 사본 `lib/pushActionText.ts`(+ 금지어 검사 테스트). 웹 원본을 먼저 고치고 복사한다(헤더 3줄 외 diff 없음, 테스트는 `vi` → `jest` 규칙).
- 확인하지 못한 것: 에뮬레이터·실기기에서의 실제 화면, TalkBack/VoiceOver 읽기 순서(Jest 컴포넌트 테스트와 `expo export --platform web` 번들만 확인). 수동 확인: 개발 빌드에서 같은 약 2회차(08:00·20:00)를 만들고 20:00 알림을 탭해 20:00 카드에만 큰 버튼이 붙는지, 체크 후 08:00 에 붙지 않는지(실제 푸시 발송은 대표님 승인 필요).

## 개인정보 후속 조치 (2026-10-12)
- **만 14세 확인(가입 화면만):** `components/AuthForm.tsx` 가입 모드에 "만 14세 이상입니다." 체크가 필요하다(체크 없이 [가입하기]를 누르면 칸 오류, 요청 안 나감). **클라이언트 전용이라 서버에 기록하지 않는다.** 가입 요청 본문은 그대로. 로그인 화면에는 없다. `EXPO_PUBLIC_PRIVACY_POLICY_URL` 이 있으면 체크 아래에 처리방침 링크를 둔다.
- **메모 안내:** 오늘 메모(`MemoSection`)와 반려동물 폼의 질환 입력칸 아래에 "반려동물의 기록만 적어 주세요. 보호자 본인의 건강 정보는 적지 마세요." 가 입력칸 바로 아래에 항상 보인다. `accessibilityHint` 는 쓰지 않는다: 보이는 글자가 이미 스크린리더에 읽혀 같은 문장이 두 번 낭독되기 때문이다(`accessibilityLabelledBy` 는 안드로이드 전용이라 쓰지 않았다). 문구는 `lib/privacyText.ts`(웹 원본의 사본).
- 로그인 없이 보는 계정 삭제 안내 페이지(`/delete-account`)는 **웹에만** 있다.

## 내 할 일 일정 (2026-10-13, 커밋 전)
기획 `.company/plans/내-할-일-일정.md`(M1~M3), 설계 `.company/design/내-할-일-일정.md`, 계약 백엔드 `docs/api-todos.md`. 웹 `/todos` 와 같은 기능이고 **새 네이티브 모듈이 없다(개발 빌드 재생성 불필요, `package.json` 변경 없음).**
- 화면: `src/todos/`(`TodosScreen` 목록 [예정][완료] 탭·`dateStatus` 묶음·제자리 접힘+[되돌리기], `TodoFormScreen` 추가/보기·고치기, `TodayTodoCard`, `TodoDeviceLine` 알림 상태 한 줄, `routes`, `todoMobileText` 모바일 전용 문구). 라우트 `app/todos/index.tsx`·`new.tsx`·`[id].tsx`(모두 `PetGate` 안, `_layout.tsx` 에 등록).
- 진입점: 오늘 화면 [리포트] 카드 아래·면책 위 카드 `내 할 일 일정`(새 API 호출 없음). 알림 탭(`PushProvider`): `todo_reminder` 면 `router.dismissTo('/todos?source=push')`(백그라운드·종료 상태 모두; 투약 알림 처리는 그대로), 포그라운드면 [할 일 열기] 배너. Provider 가 로그인한 동안에만 마운트되므로 인증 확인 뒤에 이동한다.
- 폼: 제목 40자·날짜(필수, 기본값 없음, 기존 `DateTimeField`)·시각(선택, [시각 지우기])·일정 메모 200자·알림 받기(기본 켬). 고치기 화면에만 병원 메모 500자·완료/완료 취소·[이 할 일 지우기](확인 카드 1회). 제목 칩·예시 글자·추천·반복은 없다. 권한은 [알림 허용하기] 버튼에서만 묻고, 알림이 막혀 있어도 저장된다. 고친 내용이 있으면 뒤로·스와이프·버튼 모두 `useLeaveGuard` 이탈 확인, 저장 중에는 이동만 막는다. 저장·지우기·404 뒤에는 목록으로 `dismissTo` + 안내 코드(`notice=created|updated|deleted|gone`).
- 공유 사본: `todoApi/todoForm/todoList/todoText/todoFixtures`(+테스트), `api.ts`(`'todo'` 컨텍스트·`TODO_LIMIT_REACHED`). 웹 원본을 먼저 고쳤다(테스트의 `expect(값, 메시지)` 두 번째 인자와 동적 `import()` 제거 — Jest 에서 안 돌아서). `todoApi.test.ts` 는 `vi.fn` → `jest.fn`.
- 계정 탈퇴 화면 삭제 목록에 `직접 적은 할 일 일정(제목·일정 메모·병원 메모)과 알림 발송 기록` 추가(웹 `AccountDeletePage` 와 같은 문구).
- 실기기에서 확인하지 못함: 날짜·시각 선택기, VoiceOver/TalkBack 낭독, 글자 200% 모양, 알림 도착과 탭 이동(콜드 스타트 포함), 포그라운드 배너 위치. jest(RNTL)로만 확인.

## 루틴 기록 칩 — 산책·배변 횟수 (2026-10-13, 커밋 전)
기획 `.company/plans/루틴-기록-칩.md`(M1~M2), 설계 `.company/design/루틴-기록-칩.md`, 계약 백엔드 `docs/api-routine.md`. 웹과 같은 기능이고 **새 네이티브 모듈이 없다(개발 빌드 재생성 불필요, `package.json` 변경 없음).**
- 화면: `src/today/sections/RoutineSection.tsx`(오늘 화면 `MemoSection` 다음·리포트 카드 앞). 접힌 행 `산책·배변 기록 (선택)`(기본 접힘, 불러온 직후 저장된 값이 있으면 한 번 자동 펼침, 펼침 상태는 저장하지 않음), 항목별 [−] 값 [+] [지우기](키보드 입력 없음, 안 적음 -> [+] 는 1회, 1 -> 0, 0 유지, 20 상한). 별도 저장 버튼 없이 기존 [저장] 하나로 함께 저장하고, 루틴 값이 불러온(저장한) 시점과 달라졌을 때만 `walkCount`·`poopCount` 두 키를 함께 보내고(지우면 null 명시), 안 바꿨으면 두 키를 생략한다(8필드. 서버는 생략 = 기존 값 유지라 다른 기기의 값을 지우지 않는다). 지난 기록 목록 줄은 루틴만 저장한 날 `산책 2회 · 배변 3회` 로 보인다.
- 저장 전 표시: 바꾼 값이 있으면 `저장 전` 칩과 안내 한 줄(접힌 행에도 요약 옆에 칩). 저장 실패 시 안내가 `저장하지 못했어요. …` 로 바뀌고 값은 그대로 두며, 루틴 값을 다시 고치면 `저장 전` 안내로 돌아온다. `TodayScreen` 의 `update()` 를 지나므로 기존 규칙대로 저장 되돌리기 안내가 정리되고, 접고 펴기는 안내를 정리하지 않는다.
- 저장 되돌리기: `restoreBody` 가 10필드(저장 전 루틴이 없으면 null 명시). 루틴 값이 저장 전과 달라졌을 때만 결과 안내 뒤에 한 문장(`산책·배변 기록도 저장 전 내용으로 돌아갔어요.` / 행 삭제 시 `… 함께 지워졌어요.`)을 덧붙인다. 같으면 기존 문구 그대로.
- 큰 글씨: `fontScale` 1.3 이상(`isLargeFont`)에서 값 칸 전체 폭 -> [−][+] 가로 2개 -> [지우기] 전체 폭으로 세로 배치.
- 낭독: 버튼 라벨 고정(`산책 횟수 줄이기/늘리기/지우기`) + `accessibilityValue`(현재 값), 값 변경은 마지막 입력 후 0.5초 모아 한 번(iOS `announceForAccessibility`, Android `accessibilityLiveRegion`).
- 지난 기록 하루 상세(`HistoryDayScreen`): 증상 다음·메모 앞에 `산책·배변` 한 줄(`산책 2회 · 배변 3회`, 둘 다 없으면 줄 숨김). 목록·그래프·리포트에는 넣지 않았다.
- 공유 사본: `routineForm/routineText`(+테스트, 웹 원본과 헤더 외 동일), 수정 사본 `petApi/todayForm/undoLogic/historyFixtures`. 금지어 검사 `findRoutineForbidden()`. 일반 저장 경로의 요청 본문 기대는 루틴을 안 바꾸면 8필드(두 키 생략), 바꾸면 10필드(시나리오 판정 불변; 되돌리기 `restoreBody` 는 10필드 그대로). 계정 탈퇴 화면 삭제 목록 문구에 `산책·배변 횟수` 추가(웹과 같은 문구).
- 설계와 달라진 점: 제목에 헤더 역할(`accessibilityRole="header"`)을 따로 두지 않았다(토글 버튼 안에 제목이 있어 버튼 하나로 읽힘). 값 칸 `adjustable` 동작(VoiceOver 증감)은 후속(설계상 선택).
- 테스트 결과(2026-10-13): 82스위트 999개 통과(기준선 77/948). 실기기(큰 글씨 모양, VoiceOver/TalkBack 낭독, Android liveRegion)와 실제 서버 연동은 확인하지 못했다. 처리방침 수집 항목 갱신은 대표님 승인·법무 검토 필요.

## 반려동물 유형·생일·입양일 — 온보딩 C단계 (2026-10-13, 커밋 전)
기획 `.company/plans/초보-견주-온보딩-C-E-F.md` 2장, 설계 `.company/design/초보-견주-온보딩-C.md`, 계약 백엔드 `docs/api-pet-profile.md`. 웹과 같은 기능이고 **새 네이티브 모듈·`package.json` 변경이 없다(개발 빌드 재생성 불필요).** E·F(처음 키워요 체크리스트)는 아래 별도 절.
- 화면: `src/pet/PetFormScreen.tsx`(등록·수정 공통). 종류 아래 `함께 지내는 상황 (선택)` 라디오 3개(`처음 키워요`/`나이 든 아이예요`/`나중에 정할게요`, 기본 = 나중에 = `profileType` null), 태어난 해 아래 접힌 행 `날짜 자세히 적기 (선택)`(생일 월·일, 입양일 연·월·일). 저장된 날짜가 있으면 열린 채 시작하고, 저장할 때 오류가 안에 있으면 펼친 뒤 첫 오류 칸으로 스크롤·포커스한다. 접었을 때 값이 있으면 요약 한 줄(`생일 10월 13일 · 입양 2024년 3월 2일`).
- 시트: `src/pet/OptionSheet.tsx`(YearSheet 패턴을 일반화한 목록 시트 + `PickField` 칸). `YearSheet` 는 이를 부르는 얇은 래퍼. 줄을 눌러도 [완료]에서 반영, 월은 1~12월, 일은 고른 해·월의 말일까지, 입양 연도는 올해부터 1980년(처음 위치는 올해). 선택 뒤 `{n}월로 정했어요` 등을 읽어 준다.
- 칸 연동: 태어난 해를 바꿔 없는 날(2/29)이 되면 일만 비우고 안내, 태어난 해를 지우면 생일 월·일도 비우고 안내(`changeBirthYear` 등, 공유 사본).
- 검사·본문: `validatePetDraft(draft, todayParts(new Date()))` — **`today` 를 화면이 명시해서 넘긴다**(웹 함수의 기본값에 맡기지 않음; `PetFormScreen.profile.test.tsx` 가 호출 인자를 고정). 본문은 `toPetInput(draft, 저장된 pet)`: 유형·생일·입양일은 저장값과 달라진 키만 실리고(안 건드리면 생략 = 서버가 유지, 지우면 null), 기존 사용자의 PUT 본문은 이전과 같다.
- 나가기 확인: `isPetDraftDirty` 가 새 필드를 비교한다. 날짜 행을 접고 펴는 것은 dirty 가 아니다.
- 글자 확대: `fontScale` 1.3 이상(`isLargeFont`)에서 월·일, 연·월·일 칸을 세로로 쌓는다. 유형 라디오는 처음부터 세로. 접근성: 유형 `처음 키워요, 3개 중 1번째`, 접힌 행 `날짜 자세히 적기, 선택 항목`(+요약, expanded 상태), 날짜 칸 `생일 월, 선택 안 함`/힌트 `누르면 고를 수 있어요`.
- 공유 사본: 신규 `petProfile/petProfileText`(+`petProfile.test`, `petProfileText.test`, `petFormProfile.test`), 수정 `petForm/petApi/api`(+`petForm.test`). 서버 400 문구에 날짜 포함. 계정 탈퇴 화면 삭제 목록 문구를 웹과 같게(`반려동물 프로필(이름·종류·생일·입양일·함께 지내는 상황)과 사진`). 모바일 전용 문구는 `pet/petText.ts` 의 `PET_DATE_TEXT` 등, 금지어 검사 `findPetForbidden()` 이 `findPetProfileForbidden` 까지 본다.
- 테스트 결과(2026-10-13): 86스위트 1063개 통과(기준선 82/999). 실기기(큰 글씨 모양, VoiceOver/TalkBack 낭독, 시트 스크롤, 폼 길이)와 실제 서버 연동은 확인하지 못했다. 처리방침 수집 항목 갱신은 대표님 승인·법무 검토 필요.

## 함께한 날 · 기록 N일째 — 온보딩 E단계 (2026-10-14, 커밋 전)
기획 `.company/plans/초보-견주-온보딩-C-E-F.md` 3장, 설계 `.company/design/초보-견주-온보딩-E.md`, 계약 백엔드 `docs/api-companion.md`. 웹과 같은 기능이고 **새 네이티브 모듈·`package.json` 변경이 없다(개발 빌드 재생성 불필요).** F 는 아직 없다.
- 화면: `src/today/sections/CompanionLine.tsx`(신규)를 `TodayHeader` 의 반려동물 줄(`petLine`) 바로 다음에 둔다. 카드·아이콘·강조 없음, `AppText variant="secondary"`(본문 18, 보조색), `numberOfLines` 없음(글자 확대 시 줄바꿈만 늘어남). 두 줄을 `accessible` View 하나로 묶고 `accessibilityLabel` 은 보이는 문장을 `, ` 로 이은 것(`보리와 함께한 지 120일째, 기록을 시작한 지 45일째`). 라이브 영역·알림 없음.
- 그리는 조건: `today.companion` 이 있고 `pet.profileType === 'first_time'`, 줄마다 1 이상 정수일 때만. 로딩·오류·null·필드 없음이면 View 를 만들지 않는다. 시니어·유형 미선택의 헤더 렌더 트리는 줄 없는 헤더와 같다(`CompanionLine.test.tsx` 가 JSON 비교로 고정).
- 유형을 바꾼 뒤 반영: 수정 화면은 오늘 화면 위에 쌓이고(오늘 화면이 살아 있음) 저장 후 `dismissTo` 로 돌아온다. 기존에는 돌아올 때 `syncDoses` 가 투약만 다시 읽어 `companion` 이 갱신되지 않았다. 그래서 `TodayScreen` 에 `companion` 상태를 두고 `load`/`applyToday`, 포커스 복귀 `syncDoses`, 같은 날짜 앱 복귀 재확인에서 서버 값으로 맞춘다(first_time 으로 바꾸면 돌아오자마자 줄이 보이고, senior 로 바꾸면 `profileType` 검사로 즉시 숨는다). 새 요청은 없다(기존 `/today` 재조회에 얹음).
- 공유 사본(웹과 헤더 3줄 외 동일): 신규 `lib/companionText.ts`(+`companionText.test.ts`, 테스트는 vitest import 한 줄과 `expect` 메시지 인자 2곳만 다름), 수정 `lib/petApi.ts`(`Companion` 타입, `TodayResponse.companion?`). `withParticle`(`format.ts`)·`findForbidden`(`historyText.ts`)은 모바일에 이미 사본이 있다. 클라이언트에 날짜 계산 없음.
- 테스트 결과(2026-10-14): 타입체크 오류 없음, 90스위트 1105개 통과(기준선 87/1068, 신규 3스위트 37개). 웹 79파일 920개·빌드 성공. 실기기(큰 글씨 모양, VoiceOver/TalkBack 낭독)와 실제 서버 연동은 확인하지 못했다.

## 처음 키워요 체크리스트 — 온보딩 F단계 (2026-10-14, 커밋 전)
기획 `.company/plans/초보-견주-온보딩-F.md`, 설계 `.company/design/초보-견주-온보딩-F.md`. 웹과 같은 기능이고 **새 네이티브 모듈·`package.json`·`app.config.ts` 변경이 없다(개발 빌드 재생성 불필요).**
- 진입 카드: `src/checklist/ChecklistEntryCard.tsx` 를 `TodayScreen` 의 `TodayTodoCard` 아래·면책 위에 둔다. `pet.profileType === 'first_time'` 일 때만 그리고(senior·null·로딩이면 아무것도 없음) 버튼 접근성 이름은 `처음 키워요 체크리스트 열기`. 체크 상태는 읽지 않는다.
- 화면: `app/checklist.tsx`(`PetGate` 안, 오류·없음은 기존 PetGate 가 처리) -> `src/checklist/ChecklistScreen.tsx`. 위에서부터 뒤로·제목·고정 문구·저장 안내·탭 2개(`tablist`/`tab`+`selected`)·체크 행·면책. 체크 행은 `Pressable` `accessibilityRole="checkbox"`+`accessibilityState.checked`, 최소 높이 56(질문 탭 64), 상태 글자(`체크함`/`체크 안 함`)를 항상 표시. `fontScale >= 1.3`(`isLargeFont`)이면 탭을 세로로 쌓고 상태 글자를 본문 아래로. `numberOfLines`·라이브 영역 없음. 탭 선택은 저장하지 않는다.
- 저장: `src/services/checklistStorage.ts`, secure-store 키 `spn.checklist` 하나(`{"v":1,"p":{"<petId>":[id...]}}`, 체크된 id 만). 읽기·쓰기 실패는 조용히 무시, 웹 플랫폼은 메모리만. `LOCAL_PREFERENCE_KEYS` 에 추가돼 회원 탈퇴 때 지워진다(로그아웃에는 유지).
- 공유 사본(웹과 헤더 3줄 외 동일): `lib/checklistContent.ts`·`checklistState.ts`·`checklistText.ts`(+`checklistContent.test.ts`, `checklistText.test.ts`: vitest import 한 줄과 `expect` 메시지 인자만 다름. `checklistState.test.ts` 는 웹의 순수 로직 블록만). 저장소 접근은 모바일 전용 `services/checklistStorage.ts`.
- 테스트 결과(2026-10-14): 타입체크 오류 없음, 95스위트 1141개 통과(기준선 90/1105, 신규 5스위트 36개). 실기기(큰 글씨 모양, VoiceOver/TalkBack 낭독)·실제 서버 연동은 확인하지 못했다. 항목 문구는 수의사 검수 전 초안(검수 전 출시 금지).

## 인증 흐름
- API 계약: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/me` (자세한 내용은 `src/lib/api.ts` 상단 주석).
- 토큰(JWT)은 `expo-secure-store` 에 저장(iOS Keychain / Android Keystore). 앱 시작 때 읽어 `/api/me` 로 확인한다.
- 401 을 받으면 토큰을 지우고 로그인 화면으로. 서버에 연결하지 못하면 토큰을 유지한다(오프라인 때마다 로그아웃되지 않게).
- 로그아웃 API 는 없다(refresh 토큰 없음). 기기에서 토큰만 지운다.
- 계정 관리(`src/account/`, 라우트 `/account`·`/account/password`·`/account/delete`): 오늘 맨 아래·반려동물 없음 시작 화면의 [계정] 버튼으로 진입. 비밀번호 변경 성공 시 `AuthContext.replaceToken` 으로 새 토큰 즉시 교체, 탈퇴 204 후 `finishWithdrawal`(서버 기기 해제 없이 FCM·토큰·설정 정리 → 로그인 화면에 탈퇴 안내). 400 `CURRENT_PASSWORD_MISMATCH` 는 강제 로그아웃하지 않는다. 공유 사본: `accountApi/accountForm/privacyConfig`.

## 공유 패키지 통합 계획
현재 `src/lib/` 의 아래 파일은 `web/src/lib/` 의 **사본**이다. 파일 상단에 동기화 필요 주석이 있다.

| 파일 | 내용 | 테스트 |
|------|------|--------|
| constants.ts | 면책 문구, 사진 크기·형식 제한, 메모 길이 제한 | (상수만 있어 별도 테스트 없음) |
| symptoms.ts | "특이사항 없음" 초기 상태와 토글, API 필드 변환 | symptoms.test.ts (웹 테스트 사본) |
| api.ts | API 클라이언트 본체, 오류 문구 | api.test.ts (웹 테스트 사본) |
| loginForm.ts | 로그인/회원가입 입력 검증 | loginForm.test.ts (웹 테스트 사본) |
| petApi.ts | 반려동물·약·오늘 API 계약 타입과 createPetApi | (타입·호출 경로는 화면 테스트로 확인) |
| todayForm.ts | 오늘 입력 상태·검증·본문 변환·입력 보정(쉼표) | todayForm.test.ts (웹 테스트 사본) |
| todayDoses.ts | 투약 카드 상태 전이·알림이 가리킨 회차 고르기(`decidePushHold`)·문구 | todayDoses.test.ts (웹 테스트 사본) |
| pushActionText.ts | 알림에서 바로 체크 문구·큰 버튼 라벨(금지어 검사) | pushActionText.test.ts (웹 테스트 사본) |
| format.ts | 날짜·시각·체중·조사 표시 | format.test.ts (웹 테스트 사본) |
| reminderApi.ts | 알림 규칙·기기 토큰 API 계약 타입과 createReminderApi | (화면 테스트로 확인) |
| reminderForm.ts | 알림 설정 입력 상태↔PUT 본문, 검증, 요약·다음 알림·상태 줄 문구, `buildSaveBody`·`saveMessage`·`reminderStatusLabel` | reminderForm.test.ts · reminderForm.edge.test.ts (웹 테스트 사본) |
| medicationForm.ts | 약 등록·수정 입력 검증·본문 변환·시각 추가/삭제 | medicationForm.test.ts (웹 테스트 사본) |
| petForm.ts | 반려동물 등록·수정 입력 검증·본문 변환·변경 여부·저장 오류 분류(사진 제외), 유형·생일·입양일 칸 연동 | petForm.test.ts · petFormProfile.test.ts (웹 테스트 사본) |
| petProfile.ts · petProfileText.ts | 유형·생일·입양일 날짜 계산(`daysInMonth`·`todayParts` 등), 문구·`findPetProfileForbidden` | petProfile.test.ts · petProfileText.test.ts (웹 테스트 사본) |
| todoApi.ts · todoForm.ts · todoList.ts · todoText.ts · todoFixtures.ts | 할 일 API 타입·`parseTodoReminderData`, 폼 검증·본문 변환, `dateStatus` 묶음, 문구·`findTodoForbidden`, 테스트용 예시 | todo*.test.ts (웹 테스트 사본) |

- 모바일 전용(services/): config, tokenStorage, client — 플랫폼마다 달라 사본으로 두지 않는다.
- 웹에만 있고 아직 안 가져온 파일: photo (사진 화면을 만들 때 가져온다 — 사진은 2단계로 보류).
- 기록 날짜(새벽 4시 기준)·제안값·안내 문구는 서버가 계산한다. 앱에서 따로 계산하지 않는다.
- 사본은 2026-10-08 에 웹 원본과 다시 맞췄다(헤더 주석 외 동일. reminderForm·medicationForm 은 이날 새로 가져옴).
- 웹 테스트 사본은 `import ... from 'vitest'` 한 줄을 빼고 `vi.fn` → `jest.fn` 만 바꿨다(Jest 전역 함수로 그대로 돈다).
- **지금 규칙:** 공통 로직을 고칠 때는 웹 원본을 먼저 고치고 같은 내용을 여기에 복사한다. 이 폴더만 고치지 않는다.
- **통합 시점:** 앱 본개발 착수(2~3개월 차) 때.
- **통합 방법(안):** 이 저장소에 `packages/shared/` 를 만들고 위 파일과 테스트를 옮긴 뒤,
  npm workspaces 로 `web` 과 `mobile` 이 `@senior-pet-note/shared` 로 가져다 쓴다.
  Expo 는 SDK 52 이후 모노레포(워크스페이스)를 자동 인식하므로 Metro 설정 추가는 거의 필요 없다.
  공유 패키지는 React·DOM·RN 에 의존하지 않는 순수 TS 로 유지한다(현재 파일들은 이미 그렇다).
- 플랫폼별로 다른 부분은 공유하지 않는다: API 주소 설정(Vite vs EXPO_PUBLIC), 토큰 저장(localStorage vs secure-store), 401 알림 방식.

## 앞으로 할 일
1. (완료) "오늘" 화면 본구현. 남은 확인: 실기기 키보드·글자 200%·점선 테두리, 시뮬레이터 터치 시나리오(자동화 도구 없어 미확인).
2. (1단계 완료) 반려동물 등록·수정. **남은 것: 사진 업로드(2단계, `expo-image-picker` — 네이티브 모듈이라 대표님 승인과 개발 빌드 재생성 필요).**
3. **푸시 알림(투약 알림):** `@react-native-firebase/messaging` 으로 구현됨. 알림 규칙(켜기/끄기·매일/요일/N일 간격·기간)은 앱의 약 관리 → 알림 설정 화면에서 정한다(웹과 같은 기능). 개발 빌드(`npx expo prebuild` + `npx expo run:android`)와 `google-services.json`(앱 루트, git 제외, 패키지명 `com.oraegyeot.seniorpet`)이 필요하다. Expo Go·웹 미리보기·설정 파일 없는 빌드에서는 알림만 꺼진다. 플랫폼별로 따로 판단하며 한쪽 파일만 있으면 경고를 출력하고 그쪽만 켠다. **EAS 클라우드 빌드**는 git 에 없는 설정 파일이 올라가지 않으므로 file secret 으로 넣는다: `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`(iOS 는 `GOOGLE_SERVICE_INFO_PLIST`). app.config.ts 가 이 환경변수 경로를 읽는다. iOS 는 `GoogleService-Info.plist` + APNs 키 + Apple 개발자 팀 필요(미검증).
4. `packages/shared` 통합 (위 계획).
5. 화면 컴포넌트 테스트: `@testing-library/react-native` 14 + `test-renderer`(React 19.2·RN 0.86 에서 동작 확인, async API). 전체 948개·77 스위트(2026-10-13 내 할 일 일정 추가 후).
   jest 의 기본 글자 배율(fontScale)은 2 라서 평소 배치를 볼 때는 `testing/fontScale.ts` 의 `setFontScale(1)` 을 쓴다. expo-router·선택기는 `testing/mockRouter.ts`·`testing/mockDateTimePicker.tsx` 로 대체한다.
6. 운영 API 는 반드시 `https://` 로. 정식(릴리스) 빌드의 안드로이드는 기본적으로 `http://` 통신을 막는다.

## 비용·승인이 필요한 일 (대표 승인 전 진행 금지)
- **스토어 출시:** Apple Developer Program 연 $99, Google Play 개발자 등록 $25(1회). 결제 전에 대표 승인 필요.
- Expo/EAS 계정 가입, EAS Build·Submit·Update 사용(무료 한도 초과 시 유료), 빌드 업로드, 스토어 등록 정보 작성은
  모두 외부 공개·비용과 연결되므로 대표 승인 후 진행한다. 지금 뼈대 단계에서는 어떤 계정도 만들지 않았다.
- 개발 빌드(`npx expo run:android`)는 로컬에서 무료로 가능하지만 Android Studio 설치가 필요하다.

### 실기기에서 확인할 것 (알림)
- 웹: 서비스워커가 설치되는 중(첫 방문 직후)에 [알림 받기]를 눌렀을 때 토큰 발급이 되는지(코드는 활성화를 최대 10초 기다림)
- 알림 탭 시 `?source=push&med=<id>&t=<시각>&d=<기록 날짜>` 로 열려 그 회차 카드만 강조되고 큰 [먹였어요]가 붙는지, 오늘 화면이 이미 열려 있을 때 배너 버튼 동작
- 알림 배너가 노치·상태바 아래에 놓이는지(안전 영역 반영). 배너가 뜨면 화면 프레임이 상단 인셋을 빼므로(`screenEdges`) 노치 여백이 두 번 생기지 않는지
- 알림 탭 강조: Expo Go 에서는 `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/?source=push&med=<약 id>"` 로 흉내 낼 수 있다(미검증 형식)
- 점선 테두리(제안값)가 iOS 둥근 모서리에서 깨지지 않는지, `decimal-pad` 쉼표 입력, 숫자 키패드 닫기

- 알림을 탭하면 약 관리 화면들(목록·폼·알림 설정)을 닫고 오늘 화면으로 이동한다(`router.dismissTo`, 한 번의 이동이라 뒤로가기로 약 목록이 되살아나지 않는다). 알림 설정에 저장 안 한 변경이 있으면 알림을 탭해도 "저장하지 않고 나갈까요?" 카드가 먼저 뜬다(의도).
