# 사잇말 패치 로그

## v1.4.1 (2026-01-12)
- 추론 입력 후(버튼/엔터) '추측한 단어' 목록에 즉시 표시되지 않는 문제를 방지하기 위해,
  프론트엔드 submit 로직을 **낙관적(optimistic) 업데이트** 방식으로 변경.
  - 입력 즉시 pending 엔트리를 state.guesses에 추가하고 render()
  - /api/guess 응답 수신 시 해당 엔트리를 percent/rank로 갱신
  - /api/guess 실패 시에도 입력 기록은 남기고 pending만 해제
- UI(스타일/레이아웃)는 변경 없음.
