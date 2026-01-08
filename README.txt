사잇말 v1.3.3 핫픽스

증상:
- D1_ERROR: unable to use function bm25 in the requested context

원인:
- bm25()를 집계(MIN) 내부에서 직접 사용하면서 SQLite/FTS5 컨텍스트 오류 발생

수정:
- bm25()를 서브쿼리에서 score로 계산한 뒤,
  바깥 쿼리에서 MIN(score)로 집계하도록 변경

포함:
- functions/lib/rank.js

적용:
1) functions/lib/rank.js 덮어쓰기
2) 재배포
3) /api/top?limit=10&build=1 실행
