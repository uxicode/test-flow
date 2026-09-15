import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_CHECKOUT_DUMP } from "@testflow/figma-ingest";
import { generateTestCases } from "./generate-test-cases.js";
import {
  addEditVersion,
  addRestoreVersion,
  createDocument,
  getVersion,
  headVersion,
  removeVersion,
} from "./history.js";
import { TC_CHANGE } from "./types.js";

describe("generateTestCases", () => {
  it("분기 플로우에서 TC가 2개 이상 나온다", () => {
    const cases = generateTestCases(SAMPLE_CHECKOUT_DUMP, [
      { mermaidId: "n1_1", figmaNodeId: "1:1" },
    ]);
    assert.ok(cases.length >= 2);
    assert.ok(cases.every((item) => item.steps.every((step) => step.targetHint)));
    assert.ok(cases.some((item) => item.title.includes("로그인 실패")));
    assert.ok(cases.some((item) => item.steps.some((step) => step.action === "성공")));
  });
});

describe("tc history", () => {
  it("생성·수정·복원 시 부모 버전을 남긴다", () => {
    const cases = generateTestCases(SAMPLE_CHECKOUT_DUMP);
    const created = createDocument({
      documentId: "doc-1",
      figmaFileKey: SAMPLE_CHECKOUT_DUMP.fileKey,
      figmaStartNodeId: SAMPLE_CHECKOUT_DUMP.startNodeId,
      mermaidId: "m1",
      dumpId: "d1",
      mermaidChecksum: "abc",
      cases,
    });
    const head1 = headVersion(created);
    assert.equal(head1?.version, 1);
    assert.equal(head1?.summary, TC_CHANGE.create);
    assert.equal(head1?.parentVersion, null);

    const editedCases = created.versions[0]?.cases.map((item, index) =>
      index === 0 ? { ...item, title: "수정된 제목" } : item,
    ) ?? [];
    const edited = addEditVersion(created, editedCases);
    assert.equal(headVersion(edited)?.version, 2);
    assert.equal(headVersion(edited)?.parentVersion, 1);
    assert.equal(headVersion(edited)?.summary, TC_CHANGE.edit);

    const restored = addRestoreVersion(edited, 1);
    const head3 = headVersion(restored);
    assert.equal(head3?.version, 3);
    assert.equal(head3?.summary, TC_CHANGE.restore);
    assert.equal(head3?.cases[0]?.title, getVersion(created, 1).cases[0]?.title);

    const removed = removeVersion(restored, 2);
    assert.equal(removed.versions.length, 2);
    assert.equal(headVersion(removed)?.version, 3);
    assert.throws(() => getVersion(removed, 2));
  });
});
