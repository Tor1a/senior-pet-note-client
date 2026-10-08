# 시니어펫 노트 모바일 앱 (React Native 뼈대)

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
│  │  └─ medications/    약 관리 라우트(모두 PetGate → 화면, 얇게 유지)
│  │     ├─ index.tsx            /medications            약 목록
│  │     ├─ new.tsx              /medications/new        약 등록
│  │     └─ [id]/edit.tsx · reminder.tsx   /medications/<id>/edit(수정, 알림 설정에서 오면 ?from=reminder) · /medications/<id>/reminder(알림 설정)
│  ├─ medications/       MedicationsScreen(목록·삭제·알림 상태 줄), MedicationFormScreen(등록·수정), ReminderScreen(알림 설정),
│  │                     sections/(MedicationCard·ReminderStatusLine·TimeRow·SwitchRow·RepeatSection·PeriodSection·DeviceCard·PermissionModal),
│  │                     routes.ts(경로·안내 코드), layout.ts(큰 글씨 배치 기준), useLeaveGuard.ts(저장 안 한 변경 확인), ScreenTop.tsx
│  ├─ pet/               PetProvider(GET /api/pets 첫 번째), PetGate(없음·오류·로딩 안내)
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
- 환경변수: `.env.example` 을 `.env` 로 복사하고 `EXPO_PUBLIC_API_BASE_URL` 을 고친다.

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
- 알려진 한계: iOS 확인 못 함(장비 없음). Android 에뮬레이터에서 글자 200% 화면은 눈으로 확인했으나 TalkBack 등 스크린리더 동작은 미확인. 온보딩(`?onboarding=1`)은 만들지 않았다(앱에 반려동물 등록 화면이 없음).

## 인증 흐름
- API 계약: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/me` (자세한 내용은 `src/lib/api.ts` 상단 주석).
- 토큰(JWT)은 `expo-secure-store` 에 저장(iOS Keychain / Android Keystore). 앱 시작 때 읽어 `/api/me` 로 확인한다.
- 401 을 받으면 토큰을 지우고 로그인 화면으로. 서버에 연결하지 못하면 토큰을 유지한다(오프라인 때마다 로그아웃되지 않게).
- 로그아웃 API 는 없다(refresh 토큰 없음). 기기에서 토큰만 지운다.

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
| todayDoses.ts | 투약 카드 상태 전이·강조 선택·문구 | todayDoses.test.ts (웹 테스트 사본) |
| format.ts | 날짜·시각·체중·조사 표시 | format.test.ts (웹 테스트 사본) |
| reminderApi.ts | 알림 규칙·기기 토큰 API 계약 타입과 createReminderApi | (화면 테스트로 확인) |
| reminderForm.ts | 알림 설정 입력 상태↔PUT 본문, 검증, 요약·다음 알림·상태 줄 문구, `buildSaveBody`·`saveMessage`·`reminderStatusLabel` | reminderForm.test.ts · reminderForm.edge.test.ts (웹 테스트 사본) |
| medicationForm.ts | 약 등록·수정 입력 검증·본문 변환·시각 추가/삭제 | medicationForm.test.ts (웹 테스트 사본) |

- 모바일 전용(services/): config, tokenStorage, client — 플랫폼마다 달라 사본으로 두지 않는다.
- 웹에만 있고 아직 안 가져온 파일: photo (사진 화면을 만들 때 가져온다).
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
2. 반려동물 등록·선택, 사진 업로드(`expo-image-picker`, MVP 결정 2).
3. **푸시 알림(투약 알림):** `@react-native-firebase/messaging` 으로 구현됨. 알림 규칙(켜기/끄기·매일/요일/N일 간격·기간)은 앱의 약 관리 → 알림 설정 화면에서 정한다(웹과 같은 기능). 개발 빌드(`npx expo prebuild` + `npx expo run:android`)와 `google-services.json`(앱 루트, git 제외, 패키지명 `com.oraegyeot.seniorpet`)이 필요하다. Expo Go·웹 미리보기·설정 파일 없는 빌드에서는 알림만 꺼진다. 플랫폼별로 따로 판단하며 한쪽 파일만 있으면 경고를 출력하고 그쪽만 켠다. **EAS 클라우드 빌드**는 git 에 없는 설정 파일이 올라가지 않으므로 file secret 으로 넣는다: `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`(iOS 는 `GOOGLE_SERVICE_INFO_PLIST`). app.config.ts 가 이 환경변수 경로를 읽는다. iOS 는 `GoogleService-Info.plist` + APNs 키 + Apple 개발자 팀 필요(미검증).
4. `packages/shared` 통합 (위 계획).
5. 화면 컴포넌트 테스트: `@testing-library/react-native` 14 + `test-renderer`(React 19.2·RN 0.86 에서 동작 확인, async API). 전체 296개.
   jest 의 기본 글자 배율(fontScale)은 2 라서 평소 배치를 볼 때는 `testing/fontScale.ts` 의 `setFontScale(1)` 을 쓴다. expo-router·선택기는 `testing/mockRouter.ts`·`testing/mockDateTimePicker.tsx` 로 대체한다.
6. 운영 API 는 반드시 `https://` 로. 정식(릴리스) 빌드의 안드로이드는 기본적으로 `http://` 통신을 막는다.

## 비용·승인이 필요한 일 (대표 승인 전 진행 금지)
- **스토어 출시:** Apple Developer Program 연 $99, Google Play 개발자 등록 $25(1회). 결제 전에 대표 승인 필요.
- Expo/EAS 계정 가입, EAS Build·Submit·Update 사용(무료 한도 초과 시 유료), 빌드 업로드, 스토어 등록 정보 작성은
  모두 외부 공개·비용과 연결되므로 대표 승인 후 진행한다. 지금 뼈대 단계에서는 어떤 계정도 만들지 않았다.
- 개발 빌드(`npx expo run:android`)는 로컬에서 무료로 가능하지만 Android Studio 설치가 필요하다.

### 실기기에서 확인할 것 (알림)
- 웹: 서비스워커가 설치되는 중(첫 방문 직후)에 [알림 받기]를 눌렀을 때 토큰 발급이 되는지(코드는 활성화를 최대 10초 기다림)
- 알림 탭 시 `?source=push&med=<id>` 로 열려 카드가 강조되는지, 오늘 화면이 이미 열려 있을 때 배너 버튼 동작
- 알림 배너가 노치·상태바 아래에 놓이는지(안전 영역 반영). 배너가 뜨면 화면 프레임이 상단 인셋을 빼므로(`screenEdges`) 노치 여백이 두 번 생기지 않는지
- 알림 탭 강조: Expo Go 에서는 `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/?source=push&med=<약 id>"` 로 흉내 낼 수 있다(미검증 형식)
- 점선 테두리(제안값)가 iOS 둥근 모서리에서 깨지지 않는지, `decimal-pad` 쉼표 입력, 숫자 키패드 닫기

- 알림을 탭하면 약 관리 화면들(목록·폼·알림 설정)을 닫고 오늘 화면으로 이동한다(`router.dismissTo`, 한 번의 이동이라 뒤로가기로 약 목록이 되살아나지 않는다). 알림 설정에 저장 안 한 변경이 있으면 알림을 탭해도 "저장하지 않고 나갈까요?" 카드가 먼저 뜬다(의도).
