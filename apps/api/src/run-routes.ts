import "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { RUNNER_EVENT, type RunnerStep } from "@testflow/runner-contract";
import { RUN_LIMITS } from "@testflow/shared";
import { getTcDocument } from "./tc-store.js";
import { headVersion } from "@testflow/tc-generator";
import { flushRunEvents, getRunner, subscribeRunSocket } from "./run-hub.js";
import {
  RUN_STATUS,
  createRun,
  deleteRun,
  getRun,
  listRuns,
  readEvents,
  saveRun,
  videoFile,
} from "./run-store.js";

function toRunnerSteps(caseId: string, steps: { action: string; targetHint: string; expected: string }[]): RunnerStep[] {
  return steps.map((step, index) => ({
    id: `${caseId}:${index}`,
    action: step.action,
    targetHint: step.targetHint,
    expected: step.expected,
  }));
}

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/runs", async () => ({ items: await listRuns() }));

  app.get("/api/runs/:runId", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const record = await getRun(runId);
    if (!record) return reply.code(404).send({ error: "not_found" });
    return record;
  });

  app.get("/api/runs/:runId/events", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const record = await getRun(runId);
    if (!record) return reply.code(404).send({ error: "not_found" });
    return { items: await readEvents(runId) };
  });

  app.get("/api/runs/:runId/video", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const file = videoFile(runId);
    try {
      await fs.access(file);
    } catch {
      return reply.code(404).send({ error: "video_not_found" });
    }
    return reply.type("video/webm").send(createReadStream(file));
  });

  app.delete("/api/runs/:runId", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const record = await getRun(runId);
    if (!record) return reply.code(404).send({ error: "not_found" });
    if (record.status === RUN_STATUS.queued || record.status === RUN_STATUS.running)
      await getRunner().stop(runId);
    const removed = await deleteRun(runId);
    if (!removed) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/runs/:runId/stop", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const record = await getRun(runId);
    if (!record) return reply.code(404).send({ error: "not_found" });
    await getRunner().stop(runId);
    return { ok: true };
  });

  app.post("/api/runs", async (req, reply) => {
    const body = req.body as {
      documentId?: unknown;
      caseId?: unknown;
      startUrl?: unknown;
    };
    if (typeof body.documentId !== "string" || !body.documentId)
      return reply.code(400).send({ error: "invalid_schema", message: "documentId가 필요합니다." });
    if (typeof body.startUrl !== "string" || !/^https?:\/\//i.test(body.startUrl))
      return reply.code(400).send({ error: "invalid_schema", message: "http(s) startUrl이 필요합니다." });
    const doc = await getTcDocument(body.documentId);
    const head = doc ? headVersion(doc) : null;
    if (!doc || !head) return reply.code(404).send({ error: "tc_not_found" });
    const testCase =
      typeof body.caseId === "string"
        ? head.cases.find((item) => item.id === body.caseId)
        : head.cases[0];
    if (!testCase) return reply.code(404).send({ error: "case_not_found" });

    const record = await createRun({
      documentId: body.documentId,
      caseId: testCase.id,
      startUrl: body.startUrl,
    });
    record.status = RUN_STATUS.running;
    await saveRun(record);

    const steps = toRunnerSteps(testCase.id, testCase.steps);
    void getRunner()
      .start({
        runId: record.runId,
        startUrl: body.startUrl,
        steps,
        headed: true,
        stopOnFail: true,
        stepTimeoutMs: RUN_LIMITS.stepTimeoutMs,
      })
      .then(async () => {
        await flushRunEvents(record.runId);
        const latest = (await getRun(record.runId)) ?? record;
        const events = await readEvents(record.runId);
        const failed = events.find((event) => event.type === RUNNER_EVENT.stepFailed);
        const finished = events.find((event) => event.type === RUNNER_EVENT.runFinished);
        latest.status = failed ? RUN_STATUS.failed : RUN_STATUS.passed;
        if (finished?.message?.includes("failed")) latest.status = RUN_STATUS.failed;
        latest.finishedAt = new Date().toISOString();
        latest.failStepId = failed?.stepId;
        const videoMatch = finished?.message?.match(/video=(.+)$/);
        if (videoMatch?.[1]) latest.videoPath = videoMatch[1];
        else {
          try {
            await fs.access(videoFile(record.runId));
            latest.videoPath = videoFile(record.runId);
          } catch {
            /* 녹화 없음 */
          }
        }
        await saveRun(latest);
      })
      .catch(async (error: unknown) => {
        const latest = (await getRun(record.runId)) ?? record;
        latest.status = RUN_STATUS.error;
        latest.finishedAt = new Date().toISOString();
        await saveRun(latest);
        req.log.error(error);
      });

    return reply.code(202).send(record);
  });

  app.get("/ws/runs/:runId", { websocket: true }, async (socket, req) => {
    const { runId } = req.params as { runId: string };
    const existing = await readEvents(runId);
    for (const event of existing) socket.send(JSON.stringify(event));
    const unsubscribe = subscribeRunSocket(runId, socket);
    socket.on("close", unsubscribe);
  });
}
