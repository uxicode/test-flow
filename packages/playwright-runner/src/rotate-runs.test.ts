import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { rotateRuns } from "./rotate-runs.js";

describe("rotateRuns", () => {
  it("오래된 런 디렉터리를 잘라 최대 개수만 남긴다", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "tf-runs-"));
    for (let index = 0; index < 3; index += 1) {
      const dir = path.join(root, `run-${index}`);
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "run.json"), "{}");
      await fs.utimes(dir, index + 1, index + 1);
    }
    const removed = await rotateRuns(root, 2);
    const left = (await fs.readdir(root)).filter((name) => !name.startsWith("."));
    assert.equal(removed, 1);
    assert.equal(left.length, 2);
    await fs.rm(root, { recursive: true, force: true });
  });
});
