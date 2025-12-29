# 사잇말 (한국어기초사전 DB 버전)

우리말샘(OpenDict) API 의존을 없애고, **한국어기초사전 전체 내려받기(JSON)** 데이터를 로컬에서 DB로 만든 뒤
Cloudflare **D1**(SQLite)로 올려서 게임 서버가 DB만 조회하도록 만든 버전입니다.

## 1) DB 만들기(로컬 1회)
1. 업로드해둔 전체 내려받기 ZIP을 `data/`에 두거나, 파일 경로를 지정합니다.
2. 아래 스크립트로 `dict.db`(SQLite)와 `dict.sql`(덤프)를 만듭니다.

```bash
python tools/build_db.py --input "전체 내려받기_한국어기초사전_json_20251219.zip" --out tools/dict.db
python tools/dump_sql.py --db tools/dict.db --out tools/dict.sql
```

## 2) Cloudflare D1 생성/업로드(추천: CLI)
> UI에서도 가능하지만, 대용량은 CLI(wrangler)가 가장 안정적입니다.

```bash
npm i -g wrangler
wrangler login

# D1 생성
wrangler d1 create tteutgyeop-db

# schema 적용
wrangler d1 execute tteutgyeop-db --file=tools/schema.sql

# 데이터 업로드 (덤프)
wrangler d1 execute tteutgyeop-db --file=tools/dict.sql
```

## 3) Pages 프로젝트 바인딩
Cloudflare Dashboard → Workers & Pages → (프로젝트) → Settings → Bindings
- **D1 database** 추가
  - Variable name: `DB`
  - Database: `tteutgyeop-db`

## 4) 배포
GitHub에 올리고 Pages 연결하면 됩니다.
- Build command: 없음
- Build output: `public`
- Functions: `/functions`

## 5) 법적/표기
한국어기초사전 콘텐츠는 사이트의 **저작권정책/라이선스**를 확인하고, 화면 하단에
출처/라이선스(CC BY-SA 등) 문구를 표시하세요.
