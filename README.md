# 뜻겹 (Cloudflare Pages)

우리말샘(OpenDict) 오픈 API 기반 “꼬맨틀 느낌” 단어 추론 게임입니다.

## 필요한 것
- Cloudflare Pages 프로젝트
- Cloudflare KV (네임스페이스 1개)
- Pages 환경변수
  - `OPENDICT_KEY` : 우리말샘(OpenDict) 인증키
  - `TTEUTGYOP_KV` : KV 바인딩 이름

## 확인용 엔드포인트
- `/api/health` : Functions가 살아있는지 확인
- `/api/meta` : 오늘 dateKey/환경 확인
- `/api/guess?word=사과` : 추론

## KV에 생기는 키(정상)
- `ansv14:YYYY-MM-DD` : 오늘의 정답(하루 1개)
- `w:<단어>` : 사전 캐시(7일)

## 주의
- `/api/meta`가 JSON이 아닌 HTML을 반환하면, **Functions 배포가 실패**한 상태입니다. Deployments 로그에서 Functions 빌드 오류를 먼저 해결하세요.


## Error 1101(Worker threw exception) 자주 원인
- `TTEUTGYOP_KV`를 **Variables and Secrets(텍스트 변수)** 로 넣으면 안 됩니다.
  - 그러면 코드에서 `kv.get(...)` 할 때 **문자열이라서 TypeError**가 나고 1101이 뜹니다.
- 반드시 아래처럼 해야 합니다.

### (웹 UI) KV 바인딩 연결
Workers & Pages → Pages → (프로젝트) → Settings → **Bindings** → Add → **KV namespace**
- Variable name: `TTEUTGYOP_KV`  (코드와 동일)
- KV namespace: `tteutgyeop-kv` (네가 만든 네임스페이스 선택)

그리고 Settings → **Variables and Secrets** 에서
- 만약 `TTEUTGYOP_KV`가 Plaintext로 들어가 있으면 **삭제**하세요.
- `OPENDICT_KEY`만 남기세요.


## 지금 상황(정답 생성 실패) 빠른 확인
1) `/api/diag?word=사과` 를 열어서 `lookup.detail`에 나온 **사전 에러 코드/메시지**를 확인하세요.
2) `hasKey:false`면 OPENDICT_KEY가 Production에 없거나 오타입니다.
3) `lookup.detail`에 `<error_code>`가 있으면 **키 불일치/호출 제한/파라미터 오류**입니다.
