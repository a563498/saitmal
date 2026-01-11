사잇말 v1.3.7 핫픽스 (D1 'too many SQL variables' 해결)

증상:
- build=1 실행 중
  D1_ERROR: too many SQL variables ... SQLITE_ERROR

원인:
- D1/SQLite 환경에서 IN (...) 바인딩 변수 개수 제한이 예상보다 낮게 설정되어
  lex_entry IN (?, ?, ...) 쿼리에서 placeholder가 한 번에 너무 많았음.

수정:
- lex_entry 조회 chunk 크기를 200 → 80으로 축소
- (안정장치) chunk 크기를 상수로 분리하여 필요 시 더 낮추기 쉬움

포함:
- functions/lib/rank.js

적용:
1) functions/lib/rank.js 덮어쓰기
2) 재배포
3) /api/top?limit=10&build=1 다시 실행
4) /api/top?limit=10 확인
