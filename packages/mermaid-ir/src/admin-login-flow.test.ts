import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mermaidFromSource, mermaidToDump } from "./source-to-mermaid.js";

const ADMIN_FLOW = `graph TD
    classDef mainTitle font-size:20px,font-weight:bold,fill:none,stroke:none;
    classDef processStep fill:#ffffff,stroke:#999,stroke-width:1px,rx:5,ry:5;
    classDef decision fill:#ffffff,stroke:#999,stroke-width:1px,rx:15,ry:15;
    classDef success fill:#e8f5e9,stroke:#4caf50,stroke-width:1px,color:#2e7d32,rx:5,ry:5;
    classDef fail fill:#ffebee,stroke:#ef5350,stroke-width:1px,color:#c62828,rx:5,ry:5;

    %% 1. 로그인 프로세스
    subgraph S1 ["1. 로그인 프로세스 (슈퍼관리자 / 운영자 공통)"]
        S1_S1["로그인 화면 진입"]:::processStep
        S1_S2["이메일 입력"]:::processStep
        S1_S3["비밀번호 입력"]:::processStep
        S1_S4["로그인 버튼 클릭"]:::processStep
        S1_D1{"계정 존재 여부 확인"}:::decision
        S1_S5["비밀번호 검증"]:::processStep
        S1_D2{"비밀번호 일치 여부 확인"}:::decision
        S1_D3{"권한 상태 확인"}:::decision
        S1_D4{"승인된 관리자 계정인가?"}:::decision
        S1_E1["권한별 메인"]:::processStep
        S1_E1a["슈퍼관리자<br/>대시보드"]:::processStep
        S1_E1b["운영자<br/>대시보드"]:::processStep

        S1_F1["에러 메시지"]:::fail
        S1_F2["비밀번호 오류"]:::fail
        S1_F3["승인 대기 안내<br/><small>(승인 후 이용 가능합니다)</small>"]:::fail

        S1_S1 --> S1_S2
        S1_S2 --> S1_S3
        S1_S3 --> S1_S4
        S1_S4 --> S1_D1

        S1_D1 -->|존재함| S1_S5
        S1_D1 -->|존재하지 않음| S1_F1
        S1_F1 -.-> S1_S2

        S1_S5 --> S1_D2
        S1_D2 -->|일치| S1_D3
        S1_D2 -->|불일치| S1_F2
        S1_F2 -.-> S1_S3

        S1_D3 --> S1_D4
        S1_D4 -->|승인 완료| S1_E1
        S1_D4 -->|승인 대기| S1_F3
        S1_F3 -.-> S1_S1

        S1_E1 --> S1_E1a
        S1_E1 --> S1_E1b
    end

    %% 2. 관리자 계정 신청 프로세스
    subgraph S2 ["2. 관리자 계정 신청 프로세스"]
        S2_S1["로그인 화면"]:::processStep
        S2_Btn["관리자 계정<br/>신청 클릭"]:::processStep
        S2_S2["관리자 권한 신청<br/>화면 진입"]:::processStep
        S2_S3["<b>신청 정보 입력</b><br/>━━━━━━━━━━━━━<br/>이름 | 이메일<br/>비밀번호 | 비밀번호 재입력<br/>소속 센터 | 요청 권한 유형<br/>연락처 | 신청 사유 (0/500)"]:::processStep
        S2_S4["입력값 유효성 검증<br/><small>(필수값 / 형식 검증)</small>"]:::processStep
        S2_S5["신청 버튼 활성화"]:::processStep
        S2_F1["에러 메시지 표시"]:::fail
        S2_S6["신청 버튼 클릭"]:::processStep
        S2_D1{"중복 이메일 여부 확인"}:::decision
        S2_S7["신청 저장"]:::processStep
        S2_F2["중복 안내"]:::fail
        S2_S8["승인 대기 상태 생성"]:::processStep
        S2_S9["슈퍼관리자 승인 요청 전달"]:::processStep
        S2_S10["신청 완료 안내<br/><small>(이메일 발송)</small>"]:::processStep

        S2_S1 --> S2_Btn
        S2_Btn --> S2_S2
        S2_S2 --> S2_S3
        S2_S3 --> S2_S4
        S2_S4 -->|정상| S2_S5
        S2_S4 -->|오류 존재| S2_F1
        S2_F1 -.-> S2_S3

        S2_S5 --> S2_S6
        S2_S6 --> S2_D1
        S2_D1 -->|중복 없음| S2_S7
        S2_D1 -->|중복 존재| S2_F2
        S2_F2 -.-> S2_S3

        S2_S7 --> S2_S8
        S2_S8 --> S2_S9
        S2_S9 --> S2_S10
        S2_S10 -.->|로그인 화면으로 이동| S1_S1
    end

    %% 3. 관리자 승인 프로세스
    subgraph S3 ["3. 관리자 승인 프로세스 (슈퍼관리자)"]
        S3_S1["슈퍼관리자<br/>로그인"]:::processStep
        S3_S2["관리자 승인 관리<br/>메뉴"]:::processStep
        S3_S3["신청 목록 조회"]:::processStep
        S3_S4["<b>신청 상세 확인</b><br/>━━━━━━━━━━━━━<br/>신청자 정보 | 센터<br/>요청 권한 | 신청 사유"]:::processStep
        S3_D1{"승인 여부 결정"}:::decision

        S3_E1["계정 활성화"]:::processStep
        S3_E2["권한 부여"]:::processStep
        S3_E3["승인 알림 발송<br/><small>(이메일)</small>"]:::processStep
        S3_E4["운영자 로그인 가능"]:::success

        S3_F1["반려 상태 저장"]:::processStep
        S3_F2["반려 알림 발송<br/><small>(이메일)</small>"]:::fail

        S3_S1 --> S3_S2
        S3_S2 --> S3_S3
        S3_S3 --> S3_S4
        S3_S4 --> S3_D1

        S3_D1 -->|승인| S3_E1
        S3_E1 --> S3_E2
        S3_E2 --> S3_E3
        S3_E3 --> S3_E4

        S3_D1 -->|반려| S3_F1
        S3_F1 --> S3_F2
    end

    %% 프로세스 간 연계 점선
    S2_S9 -.->|승인 요청| S3_S2
`;

describe("admin login mermaid", () => {
  it("관리자 로그인 플로우 전체를 저장한다", () => {
    const ir = mermaidFromSource(ADMIN_FLOW);
    assert.ok(ir.nodeMap.length >= 40);
    const dump = mermaidToDump(ir);
    assert.equal(dump.startNodeId, "S1_S1");
    assert.ok(dump.connections.some((edge) => edge.label === "승인 요청"));
    assert.match(dump.nodes.find((node) => node.id === "S2_S3")?.name ?? "", /신청 정보 입력/);
  });
});
