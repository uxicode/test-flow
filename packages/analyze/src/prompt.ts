export function buildQuestionPrompt(text: string): string {
  return [
    "다음은 피그마 기획서의 한 화면 설명이다. JSON만 답한다.",
    "warning은 화면에 보이는 오류 문장만 쓴다. 조건 설명은 빼고 따옴표 안 문장만 쓴다.",
    "successText는 성공하면 도착하는 화면 이름이나 성공 문구다. 따옴표가 없어도 적고, 설명에 성공이나 이동이 있으면 비우지 않는다.",
    "inputs는 이 화면에서 사람이 채우는 칸만, 위에서 아래 순서로 한 번씩 쓴다.",
    "target은 짧은 이름이다. 이메일이면 이메일, 비밀번호면 비밀번호. '이메일 입력'처럼 같은 칸을 두 번 쓰지 않는다.",
    "설명에 없는 칸은 만들지 않는다.",
    "성공에 쓸 실제 계정 값은 넣지 않는다.",
    "failureExample은 조건을 어기는 짧은 값만 쓴다.",
    '{"screenName":"","inputs":[{"target":"","constraint":"","warning":"","failureExample":""}],"successText":"","buttonName":""}',
    "",
    text,
  ].join("\n");
}
