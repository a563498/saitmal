# 뜻겹 (최종)

## 게임 방법
- 단어를 계속 입력하면서 **유사도(1~100%)**와 **공통 키워드**로 정답을 추론합니다.
- **시도 횟수 / 경과 시간 / 최고점**이 자동 기록됩니다.
- 브라우저를 껐다 켜도(LocalStorage) 진행이 유지됩니다.

## 왜 “이상한 고득점”이 줄어드나요?
- 점수는 뜻풀이 키워드 겹침(semantic)이 핵심입니다.
- 공통 키워드가 거의 없으면 **점수 상한**을 둬서,
  “납득 안 되는 높은 점수”를 최대한 방지합니다.

---

# 배포 (Cloudflare Pages)

## 1) GitHub에 업로드
- 기존 repo에 올린 걸 **전부 삭제하고 새로 올려도 됩니다.**
- 단, 히스토리까지 없애려면 새 repo가 더 쉬워요.

## 2) Cloudflare Pages 생성
Cloudflare → Workers & Pages → Create application → Pages → Connect to Git

## 3) 빌드 설정
- Framework preset: **None**
- Build command: **(비움)**
- Build output directory: **public**

## 4) 환경변수(필수)
프로젝트 Settings → Environment variables
- `OPENDICT_KEY` : 우리말샘 OpenDict API 키

⚠️ Production 환경에도 넣어야 배포 후 500이 안 납니다.

## 5) 500/오류 확인법
Deployments → (해당 배포) → Functions 로그에서 에러 확인.
대부분:
- OPENDICT_KEY 누락/오타
- 우리말샘 API 일시 오류/제한
- 폴더 구조가 `functions/api/*.js`가 아닌 경우


## 변경점(Upstream 500 대응)
- 우리말샘이 JSON 응답을 간헐적으로 500/HTML로 주는 경우가 있어, 이 버전은 **JSON 실패 시 XML로 자동 재시도**합니다.
- `/api/guess?word=사과` 를 브라우저에서 직접 열면 상세 JSON을 확인할 수 있습니다.


## v3 변경점
- 우리말샘 API 호출에 **자동 재시도(최대 3회)** 추가
- search는 **XML 우선 → 실패 시 JSON**


## v4: “오늘의 정답”을 서버에서 1개로 고정(모두 동일)
이 버전은 Cloudflare **KV**에 오늘의 정답을 저장해서,
- 첫 접속자가 정답을 “1번 생성”하면
- 그 이후 모든 사용자는 **같은 정답**을 받습니다.
- 사전 API 호출도 크게 줄어서 upstream 500이 줄어듭니다.

### Cloudflare Pages에서 KV 붙이는 법
1) Cloudflare 대시보드 → **Workers & Pages** → **KV** → Create namespace  
   예: `tteutgyeop-kv`

2) Pages 프로젝트 → **Settings** → **Functions** → **KV namespace bindings**
   - Variable name: `TTEUTGYOP_KV`
   - KV namespace: 방금 만든 `tteutgyeop-kv`

3) Deploy 다시 하기


## v5 변경점(뜻풀이 누락 문제)
- XML 파싱을 item 단위로 개선해서 definition/pos/target_code 누락을 방지했습니다.


## v6 변경점
- 우리말샘 응답 구조(여러 버전)에 맞춰 word/pos/definition 추출 로직을 크게 강화했습니다.


## v6.1 핫픽스
- opendictSearch의 XML 재시도 부분 문법 오류를 수정했습니다.
- search는 XML 우선으로 호출해 definition/target_code 누락을 줄였습니다.
- 문제가 계속되면 Functions 로그에서 실제 upstream 응답(detail)을 확인하세요.


## v6.2 핫픽스
- 특정 단어에서 뜻풀이(definition)가 비어오면 게임이 멈추지 않도록 **낮은 점수(1%)로 처리**합니다.
- 디버깅용 엔드포인트: `/api/diag?word=사과` (우리말샘 원문 일부를 보여줌)


## v6.3: 진단(/api/diag) + 정답 생성 재시도 강화
- `/api/diag?q=사과` 로 **키/사전응답/정답생성**을 한 번에 확인할 수 있습니다.
- 정답 생성은 definition이 비는 항목을 피하도록 재시도를 추가했습니다.

### Cloudflare Pages 웹(무료 플랜)에서 Production 환경변수 넣기(중요)
프로젝트 → **Settings** → (상단) **Choose environment** 를 `Production` 으로 바꾼 뒤  
`Variables and Secrets` 에 `OPENDICT_KEY` 추가/저장 → **Redeploy**.


## v6.4 변경점(당장 해결)
- OpenDict `num` 파라미터는 **최소 10** 이어야 해서, 내부적으로 **10~100 범위로 자동 보정**합니다.
- `/api/diag` 에서 보이던 `Invalid num value`(에러코드 103) 해결
- 정답 생성 시 include 검색 결과의 definition이 비어있는 경우가 많아서,
  **후보 단어를 lookupWord로 다시 조회(뜻풀이 확보)** 후 정답으로 확정합니다. (하루 1회만 실행 + KV 캐시)

### 배포 후 확인
- `/api/diag?q=사과` 에서
  - `search.ok:true` 이고
  - `answer.ok:true` 가 되면 정상입니다.


## v8 변경점(요청 반영)
- **정답은 하루 1개로 고정**: 새 게임을 눌러도 정답이 바뀌지 않고, 내 기록만 초기화됩니다.
- 입력 누적은 **유사도 높은 순 정렬** + 상단에 **오늘 최고 유사도** 표시
- 모바일 UI 최적화(가로 스크롤 최소화)
- 단서 표현을 더 직관적으로 개선(글자수: 같음/짧음/김, 초성 일치 개수)
- 사전 조회 속도 개선: 단어 뜻풀이를 **KV에 7일 캐시**
- 유사도 개선: **복합어/부분일치(하노이탑문제 vs 하노이)** 케이스를 보정하는 substring + 단어 n-gram 토큰 추가
- 힌트칸 제거, “정답 공개” 대신 **포기하기**
- 난이도 과도한 정답(방언/옛말/너무 긴 단어 등) 필터링(기본: 2~5글자)

### 주의
필터 때문에 “5글자 초과 정답”은 의도적으로 제외됩니다. (원하면 6~7로 완화 가능)


## v8.1 핫픽스
- 우리말샘 표제어에 포함될 수 있는 **하이픈/가운데점/공백**을 제거해서 표시 및 길이 비교가 어긋나지 않게 수정했습니다. (예: 코뿔-소 → 코뿔소)
- 중복 입력 판정도 정규화 기준으로 처리


## v9 UI
- 가독성 중심(표) UI로 재구성 + 모바일에서는 카드형으로 자동 전환(가로 스크롤 최소화)
- 유사도 높은 순 정렬, 오늘 최고 유사도 표시 유지


## v10 변경점 (요청 반영)
- **꼬맨틀 느낌**의 리스트 UI(막대그래프 유지)로 복귀 + 더 예쁘게 정리
- **다크/라이트 모드 토글**(우측 상단 🌙/☀️, 로컬저장)
- API 응답 스키마를 다시 통일:
  - `/api/guess` → `{ ok:true, data:{ word, similarity, isCorrect, clues } }`
  - 프론트도 이에 맞춤 → “유사도 칸이 비어 진행 안 됨” 문제 해결
- 정답 KV 키를 `ansv10:<dateKey>`로 변경해 **이전 버전에서 남아있는 여러 정답 캐시**와 충돌 방지

### 배포 후 체크
- `/api/meta` 가 ok:true
- 단어 입력 시 응답에 `data.similarity` 숫자가 내려오는지 확인


## v11 정리(중요)
- KV에 보이는 키는 2종류입니다.
  - `ansv11:YYYY-MM-DD` → **오늘의 정답(서버가 자동 생성)** (하루 1개)
  - `w:<단어>` → **사전 뜻풀이 캐시** (사용자가 입력한 단어도 캐시에 저장됨, 정상)
- 따라서 `w:사과`, `w:사까리` 등이 보이는 건 **정답이 생성되는 게 아니라 캐시가 쌓이는 것**입니다.

### 기존에 남아있는 키
예전 버전에서 만들어진 `ans:YYYY-MM-DD` 같은 키가 KV에 남아있을 수 있어요.
v11부터는 `ansv11:`만 사용하므로, 남아있는 옛 키는 무시해도 됩니다(원하면 KV Pairs에서 삭제 가능).
