
사잇말 v1.3 패치 (FTS 기반 의미 유사도 랭킹)

이 ZIP에는 '수정/추가된 파일'만 포함되어 있습니다.
UI 변경은 없고, 내부 로직만 교체합니다.

구성:
- functions/lib/rank.js        : FTS(BM25)로 answer_rank 생성
- functions/api/top.js         : top 조회 (+ build=1 개발용)
- functions/api/guess.js       : rank 기반 percent 계산
- sql/setup.sql                : answer_rank, FTS, 인덱스 SQL 모음

적용 방법:
1) 각 파일을 기존 프로젝트의 동일 경로에 덮어쓰기(또는 병합)
2) D1에 sql/setup.sql 실행(이미 했다면 스킵)
3) 환경변수:
   - RANK_TOPK=3000
   - RANK_CANDIDATE_LIMIT=8000
4) 개발 확인(1회):
   /api/top?limit=10&build=1
5) 운영 전환:
   - build=1 경로 제거 또는 관리자 전용으로 잠금
