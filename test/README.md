# 뜻겹 (우리말샘 기반 · 동적 버전)

- 프론트(정적): `public/`
- 백엔드(동적): `functions/api/*` (Cloudflare Pages Functions)
- 사전 데이터: 우리말샘(OpenDict) 오픈 API 호출로 실시간 조회

## 1) 인증키 발급
우리말샘 오픈 API 사용 신청 후 인증키를 발급받고,
Cloudflare Pages 프로젝트의 환경변수에 아래를 추가하세요.

- `OPENDICT_KEY` = (32자리 16진수 키)

## 2) 배포 (Cloudflare Pages)
1. 이 폴더를 GitHub에 올리거나, Cloudflare Pages에서 업로드
2. Build 설정
   - Framework preset: None
   - Build command: (비움)
   - Build output directory: `public`
3. Environment Variables에 `OPENDICT_KEY` 설정
4. Deploy

## 3) 로컬 실행(프론트만 확인)
```bash
python -m http.server 8000 --directory public
```

※ Functions는 Cloudflare 환경에서 동작합니다.
전체 테스트는 Pages Deploy 또는 `wrangler pages dev`를 사용하세요.

## 프록시가 필요한 이유
정적 사이트에서 우리말샘 API를 직접 호출하면 인증키가 노출됩니다.
그래서 Functions/Workers에서 서버측 호출로 숨깁니다.

## API
- `GET /api/meta`
- `GET /api/guess?word=단어`
- `GET /api/hint?level=1|2`
- `GET /api/reveal`
- (디버그) `GET /api/lookup?word=단어`

## 정답 선택 방식
- “오늘의 정답”은 날짜(Asia/Seoul)로 seed를 만들고,
  검색어(가/나/다/…) + 랜덤 페이지(start)로 후보를 뽑아 1개를 고릅니다.
- `새 게임`은 gameId를 seed로 써서 랜덤 정답을 뽑습니다.
