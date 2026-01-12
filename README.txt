사잇말 v1.3.9 패치 (매핑 정정: answer_pool 기반으로 통일)

확인 결과:
- lex_entry.entry_id IN (answer_rank.word_id) => 0건
- answer_pool.word_id IN (answer_rank.word_id) => 10건
즉, answer_rank.word_id는 lex_entry가 아니라 answer_pool의 word_id와 매칭됨.

수정 내용:
1) buildAnswerRank: display_word/pos 메타를 answer_pool에서만 조회(lex_entry fallback 제거)
2) /api/guess: 사용자가 입력한 단어를 answer_pool에서 찾아 word_id를 얻고,
   그 word_id로 answer_rank를 조회하도록 변경

포함 파일:
- functions/lib/rank.js
- functions/api/guess.js

적용:
1) 두 파일 덮어쓰기
2) 배포
3) /api/top?limit=10&build=1 (오늘자 랭킹 재생성; display_word/pos 채워짐)
4) /api/top?limit=10 확인
5) /api/guess?word=풀 등으로 rank/percent 확인
