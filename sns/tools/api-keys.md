# Google API 키 발급 가이드

궁금해달 자동 제작에 필요한 키는 두 개입니다.

| 키 | 용도 | 환경 변수 이름 | 비용 |
|---|---|---|---|
| Cloud Text-to-Speech 키 | 내레이션 음성 | `GOOGLE_TTS_API_KEY` | Neural2 목소리는 매달 100만 자까지 무료 (1편 약 350자) |
| Gemini API 키 | Veo 영상 클립, Nano Banana 이미지 | `GEMINI_API_KEY` | Veo는 유료 등급만 가능. 최소 $5 선불 충전 |

> 콘솔 메뉴 이름은 가끔 바뀝니다. 아래와 조금 달라도 같은 뜻의 메뉴를 찾으면 됩니다.
> 요금과 무료 사용량은 바뀔 수 있으니 결제 전에 공식 요금 페이지를 확인하세요.
> - [Text-to-Speech 요금](https://cloud.google.com/text-to-speech/pricing)
> - [Gemini API 요금](https://ai.google.dev/gemini-api/docs/pricing)

---

## 1부. 음성 키 (Cloud Text-to-Speech)

### 1. Google Cloud 콘솔 들어가기
1. [console.cloud.google.com](https://console.cloud.google.com) 에 Google 계정으로 로그인
2. 처음이면 국가(대한민국)를 고르고 서비스 약관에 동의

### 2. 프로젝트 만들기
1. 화면 맨 위 왼쪽의 **프로젝트 선택** 버튼 클릭
2. 오른쪽 위 **새 프로젝트**
3. 프로젝트 이름: `gungeumhaedal` (아무 이름이나 가능) → **만들기**
4. 알림이 뜨면 **프로젝트 선택**을 눌러 새 프로젝트로 이동
   - 맨 위에 프로젝트 이름이 `gungeumhaedal`로 보이는지 꼭 확인

### 3. 결제 계정 연결 (필수)
Text-to-Speech는 무료 사용량 안에서 써도 결제 계정이 연결돼 있어야 합니다. 무료 사용량을 넘으면 그때부터 요금이 나갑니다.
1. 왼쪽 위 **☰ 메뉴 → 결제**
2. **결제 계정 연결** 또는 **결제 계정 만들기**
3. 카드 정보를 입력하고 이 프로젝트에 연결

### 4. 예산 알림 걸기 (강력 추천)
실수로 많이 쓰는 걸 막는 안전장치입니다.
1. **☰ 메뉴 → 결제 → 예산 및 알림 → 예산 만들기**
2. 금액: 예) 10,000원
3. 알림: 50%, 90%, 100% → 메일로 알림
> 예산 알림은 **알려주기만** 하고 자동으로 멈추지는 않습니다.

### 5. Text-to-Speech API 켜기
1. **☰ 메뉴 → API 및 서비스 → 라이브러리**
2. 검색창에 `Cloud Text-to-Speech API`
3. 클릭 → **사용** 버튼

### 6. API 키 만들기
1. **☰ 메뉴 → API 및 서비스 → 사용자 인증 정보**
2. 위쪽 **+ 사용자 인증 정보 만들기 → API 키**
3. 키가 만들어지면 창을 바로 닫지 말고 **키 수정**(또는 키 이름 클릭)으로 들어가기

### 7. 키 제한하기 (중요)
키가 새어 나가도 음성 말고 다른 데는 못 쓰게 막습니다.
1. 이름: `tts-gungeumhaedal`
2. **애플리케이션 제한사항**: `없음` 그대로
   (Claude가 클라우드 서버에서 쓰기 때문에 IP나 웹사이트로 제한하면 막힙니다)
3. **API 제한사항 → 키 제한** → 목록에서 `Cloud Text-to-Speech API`만 체크
4. **저장**
5. **키 표시**를 눌러 키 값을 복사 → 바로 3부에서 환경 변수에 넣기

---

## 2부. Gemini API 키 (Veo 영상, Nano Banana 이미지)

### 1. AI Studio에서 키 만들기
1. [aistudio.google.com](https://aistudio.google.com) 에 **같은 Google 계정**으로 로그인
2. 왼쪽 아래(또는 위) **Get API key → API 키 만들기(Create API key)**
3. 프로젝트 선택 화면에서 1부에서 만든 **`gungeumhaedal`** 선택 → 만들기
   - 같은 프로젝트를 고르면 결제와 예산 알림을 한곳에서 관리할 수 있습니다

### 2. 유료 등급으로 올리기 (Veo를 쓰려면 필수)
- API 키만 만들면 **무료 등급**입니다. 무료 등급으로는 Veo 영상을 만들 수 없습니다.
- AI Studio의 **결제 설정(Set up billing / Upgrade)** 에서 결제 계정을 연결하고 **최소 $5를 선불 충전**하면 유료 등급이 됩니다.
- ⚠️ 2026년 3월 2일 이후 만든 결제 계정이면, Google Cloud 신규 가입 $300 크레딧을 **Gemini API에는 쓸 수 없습니다.** (Text-to-Speech 같은 다른 서비스에는 사용 가능)

### 3. 키 제한 확인
1. 콘솔 **API 및 서비스 → 사용자 인증 정보**에 AI Studio에서 만든 키가 보입니다
2. 이름을 `gemini-gungeumhaedal`로 바꾸고, **API 제한사항**에 `Generative Language API`만 있는지 확인 → 저장

---

## 3부. Claude 환경에 키 넣기

### 방법 A (추천, 현재 사용 중): API credentials
키를 Claude도 볼 수 없게 보관하고, 요청이 나갈 때만 프록시가 붙여 줍니다. 이미 열려 있는 세션에도 바로 적용됩니다.
1. [claude.ai/code](https://claude.ai/code) 에서 **메시지 입력창 바로 위의 구름 아이콘**(현재 환경 이름이 적힌 버튼) 클릭
2. 쓰고 있는 환경에 마우스를 올리고 오른쪽 **톱니바퀴(설정)** 클릭
3. **API credentials → Add credential**
   - 음성: Allowed websites `texttospeech.googleapis.com`, 헤더 Name `X-Goog-Api-Key`, Prefix 비움, Value에 키
   - Gemini: Allowed websites `generativelanguage.googleapis.com`, 헤더 Name `x-goog-api-key`, Prefix 비움, Value에 키
4. 편집기는 `--tts` 옵션으로 실행합니다. (키 없이 요청하면 프록시가 붙임)

### 방법 B: 환경 변수 (API credentials 항목이 없을 때)
1. 같은 설정 창의 **Environment variables** 칸에 한 줄씩 적고 저장
   ```
   GOOGLE_TTS_API_KEY=(1부에서 복사한 키)
   GEMINI_API_KEY=(2부에서 만든 키)
   ```
> 그 환경을 쓰는 사람은 누구나 값을 읽을 수 있습니다. **본인만 쓰는 개인 환경**에 넣고,
> 조직 공유 환경이라면 **Add cloud environment**로 개인 환경을 새로 만들어 쓰세요.
> Google 콘솔의 **키 제한**도 꼭 걸어 두세요.

### 새 세션 열기
환경 설정은 **새로 시작하는 세션부터** 적용됩니다.
1. claude.ai/code 왼쪽 사이드바에서 **새 세션** 시작 (휴대폰 Claude 앱은 **Code** 탭에서 새로 시작)
2. 저장소 `test-project`, 입력창 위 구름 아이콘에서 **키를 넣은 환경**이 선택돼 있는지 확인
3. 첫 메시지로 이렇게 보냅니다
   > `claude/sns-account-strategy-h9eu1q` 브랜치로 체크아웃해서 `sns/tools/README.md`를 보고, ep01을 음성 넣어서 다시 렌더링해줘

작업 파일은 아직 `main`이 아니라 위 브랜치에만 있으므로 **브랜치 이름을 꼭 알려줘야** 합니다.

---

## 보안 수칙
- **키를 채팅창, 저장소, 캡처 화면에 절대 올리지 않기**
- 키가 노출됐다면: 콘솔 **사용자 인증 정보**에서 그 키 **삭제** → 새로 만들기 → 환경 변수 교체
- 한 달에 한 번 **결제 → 보고서**에서 사용량 확인
