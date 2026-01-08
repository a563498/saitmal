
사잇말 v1.3.1 핫픽스 (Error 1101 수정)

원인:
- D1의 batch API를 잘못 사용(env.DB.batch() builder 방식)하여 런타임 예외(TypeError)가 발생 → Error 1101

수정:
- D1 공식 batch 호출 방식(env.DB.batch([...preparedStatements]))으로 변경
- 너무 큰 batch를 피하기 위해 100개 단위로 chunk 처리

이 ZIP에는 '수정된 파일만' 포함되어 있습니다.
- functions/lib/rank.js

적용:
1) functions/lib/rank.js 를 프로젝트에 덮어쓰기
2) 배포(재배포) 후 /api/top?limit=10&build=1 한 번 실행해 랭킹 생성 확인
