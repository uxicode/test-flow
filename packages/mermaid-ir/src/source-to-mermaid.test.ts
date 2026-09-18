import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_CHECKOUT_DUMP } from "@testflow/figma-ingest";
import { dumpToMermaid } from "./dump-to-mermaid.js";
import { MERMAID_ERROR, MermaidError } from "./error-codes.js";
import { mermaidFromSource, mermaidToDump } from "./source-to-mermaid.js";

const SAMPLE = `flowchart TD
  start["로그인"]
  home["홈"]
  start -->|성공| home
`;

describe("mermaidFromSource", () => {
  it("노드와 연결을 IR로 만든다", () => {
    const ir = mermaidFromSource(SAMPLE);
    assert.match(ir.mermaid, /^flowchart TD/m);
    assert.equal(ir.nodeMap.length, 2);
    assert.ok(ir.nodeMap.some((entry) => entry.mermaidId === "start"));
    assert.equal(ir.checksum.length, 64);
  });

  it("헤더가 없으면 invalid_mermaid", () => {
    assert.throws(
      () => mermaidFromSource("start --> home"),
      (error: unknown) =>
        error instanceof MermaidError && error.code === MERMAID_ERROR.invalidMermaid,
    );
  });

  it("덤프에서 만든 mermaid를 다시 파싱한다", () => {
    const generated = dumpToMermaid(SAMPLE_CHECKOUT_DUMP);
    const parsed = mermaidFromSource(generated.mermaid);
    assert.equal(parsed.nodeMap.length, generated.nodeMap.length);
    assert.equal(parsed.checksum, generated.checksum);
  });

  it("graph TD subgraph·classDef·점선·결정 노드를 파싱한다", () => {
    const source = `graph TD
    classDef processStep fill:#ffffff,stroke:#999;
    classDef decision fill:#ffffff,stroke:#999;
    classDef fail fill:#ffebee,stroke:#ef5350;
    %% 로그인
    subgraph S1 ["1. 로그인 프로세스"]
        S1_S1["로그인 화면 진입"]:::processStep
        S1_D1{"계정 존재 여부 확인"}:::decision
        S1_E1a["슈퍼관리자<br/>대시보드"]:::processStep
        S1_F1["에러 메시지"]:::fail
        S1_S1 --> S1_D1
        S1_D1 -->|존재하지 않음| S1_F1
        S1_F1 -.-> S1_S1
    end
    subgraph S2 ["2. 신청"]
        S2_S9["승인 요청 전달"]:::processStep
        S2_S9 -.->|승인 요청| S1_S1
    end
`;
    const ir = mermaidFromSource(source);
    assert.equal(ir.nodeMap.length, 5);
    const dump = mermaidToDump(ir);
    assert.equal(dump.startNodeId, "S1_S1");
    assert.equal(dump.nodes.find((node) => node.id === "S1_E1a")?.name, "슈퍼관리자 대시보드");
    assert.ok(dump.connections.some((edge) => edge.label === "승인 요청"));
    assert.ok(dump.connections.some((edge) => edge.from === "S1_F1" && edge.to === "S1_S1"));
  });

  it("stadium 노드와 -- \"라벨\" --> 한 줄 연결을 파싱한다", () => {
    const source = `flowchart TD
    Start([EMR: 환자 '홍길동' 선택 후 '닥터바이스 교육' 클릭]) --> Step1["POST /ysarang/login<br/>(accessToken 발급)"]
    Step1 --> Step2["POST /doctorvice/patients 호출"]
    Step2 --> CheckResult{등록 응답 결과 확인}
    CheckResult -- "201 Created (신규 환자)" --> Case201["신규 발급된 patientId 수신"]
    CheckResult -- "400 Bad Request (code: 3001)<br/>동일 사용자 존재" --> Case400["기존 patientId 조회"]
    Case201 --> LaunchBrowser["웹 브라우저 / 웹뷰 실행"]
    Case400 --> LaunchBrowser
    LaunchBrowser --> End([닥터바이스 환자 교육 화면 진입])
    classDef successNode fill:#dcfce7,stroke:#16a34a;
    class Case201 successNode;
`;
    const ir = mermaidFromSource(source);
    const dump = mermaidToDump(ir);
    assert.equal(dump.startNodeId, "Start");
    assert.equal(dump.nodes.length, 8);
    assert.match(dump.nodes[0]?.name ?? "", /홍길동/);
    assert.ok(dump.connections.some((edge) => edge.label?.includes("201 Created")));
    assert.ok(dump.connections.some((edge) => edge.label?.includes("400 Bad Request")));
  });

  it("노드 없는 flowchart는 invalid_mermaid", () => {
    assert.throws(
      () => mermaidFromSource("flowchart TD\n"),
      (error: unknown) =>
        error instanceof MermaidError && error.code === MERMAID_ERROR.invalidMermaid,
    );
  });
});

describe("mermaidToDump", () => {
  it("첫 노드를 startNodeId로 두고 연결을 복원한다", () => {
    const dump = mermaidToDump(mermaidFromSource(SAMPLE));
    assert.equal(dump.startNodeId, "start");
    assert.equal(dump.nodes[1]?.name, "홈");
    assert.equal(dump.connections[0]?.label, "성공");
  });
});
