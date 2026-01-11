사잇말 v1.3.8 핫픽스 (top 표시값 null 해결: 메타 소스 변경)

증상:
- /api/top 결과에서 display_word/pos가 전부 null

원인(가능성 높음):
- answer_rank에 저장되는 word_id가 lex_entry.entry_id와 1:1로 매칭되지 않아
  빌드 단계에서 lex_entry로 메타 조회가 0건 → null로 저장됨.

수정:
- 빌드 시 메타(display_word,pos)는 lex_entry 대신 answer_pool에서 조회
  (answer_pool은 word_id, display_word, pos를 이미 보유)
- 안전장치로 answer_pool에서 못 찾는 항목만 lex_entry에서 2차 조회(소량)

포함:
- functions/lib/rank.js

적용:
1) functions/lib/rank.js 덮어쓰기
2) 재배포
3) /api/top?limit=10&build=1 (오늘자 랭킹 재생성)
4) /api/top?limit=10 확인
