사잇말 통합 패치 v1.4.1 (v1.4.0 + v1.4.1)

포함:
- v1.4.0: 정답/랭킹 기준 통일(meta/top/guess 동일 정답 사용), dateKey를 KST 기준으로 통일
- v1.4.1: 추론 입력(엔터/버튼) 시 즉시 '추측한 단어'에 표시(낙관적 UI) + PATCHLOG 누적 기록

변경 파일:
- saitmal-main/functions/api/meta.js
- saitmal-main/functions/api/top.js
- saitmal-main/functions/api/guess.js
- saitmal-main/public/app.js
- PATCHLOG.md (추가)

적용 순서:
1) ZIP 풀기
2) 위 파일들을 저장소에 덮어쓰기
3) 배포(커밋/푸시)
4) 한 번만 실행: /api/top?limit=10&build=1  (오늘자 랭킹 재생성)
5) 확인: /api/top?limit=10  ,  게임 화면에서 입력 후 Enter/추론 버튼 -> 즉시 리스트 표시

주의:
- build=1은 운영 시 관리자 키로 잠그는 것을 권장
