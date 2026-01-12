사잇말 통합 패치 v1.4.6 (v1.4.4 + v1.4.5 + '정답 랭킹 제외' 포함)

포함:
- v1.4.4: '인간적' 유사도 강화를 위한 2단계 리랭킹(FTS 후보 + 정의문 키워드/구 겹침)
- v1.4.5: percentFromRank export 복구(빌드 실패 해결)
- v1.4.6 추가: 정답은 answer_rank에서 제외(랭킹 1위는 '정답 제외 최상위 유사어'), 랭킹 percent는 최대 99.99

변경 파일(덮어쓰기):
- saitmal-main/functions/lib/rank.js
- saitmal-main/functions/api/top.js
- saitmal-main/functions/api/guess.js
- saitmal-main/functions/api/meta.js (기존 유지 형태; 빌드 트리거만)
- PATCHLOG.md (누적 기록)

적용:
1) ZIP 풀기
2) 위 파일들을 저장소에 덮어쓰기
3) 배포(커밋/푸시)
4) 1회 실행: /api/top?limit=20&build=1  (오늘자 랭킹 재생성)
5) 확인: /api/top?limit=30  /api/guess?word=비밀스럽다

선택 튜닝 환경변수:
- RANK_TOPK (기본 3000)
- RANK_CANDIDATE_LIMIT (기본 12000)
- RANK_RERANK_N (기본 1200)
