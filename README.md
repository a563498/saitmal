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
- `ansv13:YYYY-MM-DD` : 오늘의 정답(하루 1개)
- `w:<단어>` : 사전 캐시(7일)

## 주의
- `/api/meta`가 JSON이 아닌 HTML을 반환하면, **Functions 배포가 실패**한 상태입니다. Deployments 로그에서 Functions 빌드 오류를 먼저 해결하세요.
