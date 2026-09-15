import type { FastifyInstance } from "fastify";
import { dumpToMermaid, MermaidError } from "@testflow/mermaid-ir";
import { getDump } from "./dump-store.js";
import { deleteMermaid, getMermaid, listMermaid, saveMermaid } from "./mermaid-store.js";

function sendMermaidError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof MermaidError)
    return reply.code(400).send({
      error: error.code,
      message: error.message,
      figmaNodeId: error.figmaNodeId,
    });
  throw error;
}

export async function registerMermaidRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/mermaid", async () => ({ items: await listMermaid() }));

  app.get("/api/mermaid/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await getMermaid(id);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    return doc;
  });

  app.delete("/api/mermaid/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = await deleteMermaid(id);
    if (!removed) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.get("/api/mermaid/:id/raw", async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await getMermaid(id);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    return reply.type("text/plain; charset=utf-8").send(doc.mermaid);
  });

  app.post("/api/mermaid", async (req, reply) => {
    const body = req.body as { dumpId?: unknown };
    if (typeof body.dumpId !== "string" || !body.dumpId)
      return reply.code(400).send({ error: "invalid_schema", message: "dumpId가 필요합니다." });
    const dump = await getDump(body.dumpId);
    if (!dump) return reply.code(404).send({ error: "dump_not_found" });
    try {
      const startedAt = Date.now();
      const ir = dumpToMermaid(dump);
      const stored = await saveMermaid(dump.id, ir);
      req.log.info({ elapsedMs: Date.now() - startedAt, mermaidId: stored.id }, "mermaid generated");
      return reply.code(201).send(stored);
    } catch (error) {
      return sendMermaidError(reply, error);
    }
  });
}
