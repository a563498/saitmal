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
- redeploy
