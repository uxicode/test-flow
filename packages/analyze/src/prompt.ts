export function buildQuestionPrompt(text: string, options?: { vision?: boolean }): string {
  const contextIntro = options?.vision
    ? [
        "# [분석 대상 및 기본 지침]",
        "- 이미지는 피그마 기획서 한 화면(왼쪽: 와이어프레임/UI, 오른쪽: 기능 설명)입니다.",
        "- 왼쪽 화면에 실제로 존재하는 입력란·버튼·문구와 오른쪽 기능 설명을 대조하여 JSON으로만 응답하세요.",
        "- 설명 글에만 적혀 있고 왼쪽 화면 UI에 없는 가상의 요소는 절대로 만들지 마세요.",
      ]
    : [
        "# [분석 대상 및 기본 지침]",
        "- 기획서의 화면 설명을 분석하여 아래 규칙에 맞는 JSON으로만 응답하세요.",
        "- 설명에 없는 가상의 입력 요소나 임의의 필드를 생성하지 마세요.",
      ];

  const sections = [
    ...contextIntro,
    "",
    "# [출력 JSON 스키마]",
    '{"screenName":"","inputs":[{"target":"","control":"text","options":[],"constraint":"","warning":"","failureExample":""}],"successText":"","buttonName":""}',
    "",
    "# [1. 화면 정보 및 액션 규칙]",
    "- screenName: 화면의 공식 명칭을 적습니다.",
    "- buttonName: 화면의 메인 제출·실행 버튼 명칭(예: 저장, 등록, 조회, 로그인 등)을 적습니다.",
    "- successText: 동작 완료 후 이동하는 도착 화면명 또는 성공 안내 문구를 적습니다. (설명에 이동 화면이나 성공 문구가 있다면 비우지 마세요)",
    "",
    "# [2. 입력 필드(inputs) 추출 규칙]",
    "- 화면에서 사용자가 직접 입력하거나 선택하는 실제 UI 요소만 위에서 아래 순서로 1회씩 추출합니다.",
    "- 조회·현황·목록 화면의 표 행(Row)은 기능 설명이므로 inputs에 넣지 마세요. 실제 검색/필터 입력 칸(이름, 검색어 등)만 추출합니다.",
    "- target: 화면 라벨을 기반으로 한 간결한 명칭을 씁니다. (예: '이메일 입력' 대신 '이메일', '등록일 필터' 대신 '등록일')",
    "- constraint: 필수 여부나 형식 조건(예: 필수, 영문+숫자 8자 이상)을 씁니다. 조건이 없으면 빈 문자열(\"\")입니다.",
    "- 성공 테스트에 사용할 실제 비밀번호/계정 값은 넣지 않습니다.",
    "",
    "# [3. 컨트롤 타입(control) 및 선택지(options) 판별 기준]",
    "- control 허용 값: text, password, textarea, select, radio, checkbox, combobox, date, date_range, file",
    "- 텍스트류:",
    "  * text: 한 줄 일반 텍스트 입력",
    "  * password: 비밀번호 등 마스킹 입력",
    "  * textarea: 여러 줄 장문 입력",
    "- 날짜류:",
    "  * date: 단일 날짜 선택",
    "  * date_range: 시작일~종료일 기간 지정",
    "- 선택류:",
    "  * select: 펼침 목록에서 1개 선택 (HTML select 등)",
    "  * combobox: 텍스트 직접 입력과 목록 검색/선택이 결합된 드롭다운",
    "  * radio: 라디오 버튼 그룹 (1개 선택)",
    "  * checkbox: 단일 또는 다중 체크박스",
    "- file: 파일/이미지 첨부 칸",
    "- options 규칙:",
    "  * select, radio, checkbox, combobox: 화면에 보이는 선택지 텍스트를 배열로 기재 (예: [\"전체\", \"남성\", \"여성\"])",
    "  * text, password, textarea, date, date_range, file: options는 반드시 빈 배열([])로 지정",
    "",
    "# [4. 유효성 검증(warning, failureExample) 규칙]",
    "- warning: 기획서 설명이나 화면에 실제로 명시된 에러/경고 문장만 정확히 적습니다. 없으면 빈 문자열(\"\")입니다.",
    "  * 검색·필터 입력 칸에 임의로 '입력해주세요' 같은 필수 경고를 지어내지 마세요.",
    "- failureExample: 조건을 위반하는 짧은 테스트용 입력값입니다.",
    "  * '입력해주세요'처럼 값을 비워야 하는 필수 검증이면 빈 문자열(\"\")로 둡니다. (칸 이름을 값으로 쓰지 마세요)",
    "  * password 등 형식 조건이 있는 경우 형식을 어기는 짧은 값을 적습니다.",
    "",
    "# [기획서 본문]",
    text,
  ];

  return sections.join("\n");
}
