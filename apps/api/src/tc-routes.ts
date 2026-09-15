import type { FastifyInstance } from "fastify";
import { TC_ERROR, TcError } from "@testflow/tc-generator";
import {
  addEditVersion,
  addGeneratedVersion,
  addRestoreVersion,
  createDocument,
  generateTestCases,
  getVersion,
  headVersion,
  removeVersion,
  tcDocumentId,
  testCasesToMarkdown,
  toDocumentSummary,
  toVersionSummaries,
  validateCases,
  type TestCase,
} from "@testflow/tc-generator";
import { getDump } from "./dump-store.js";
import { getMermaid } from "./mermaid-store.js";
import {
  deleteTcDocument,
  getTcDocument,
  listTcDocuments,
  saveTcDocument,
} from "./tc-store.js";

function sendTcError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof TcError) {
    const status = error.code === TC_ERROR.versionNotFound ? 404 : 400;
    return reply.code(status).send({ error: error.code, message: error.message });
  }
  throw error;
}

export async function registerTcRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/tc", async () => {
    const docs = await listTcDocuments();
    return { items: docs.map(toDocumentSummary) };
  });

  app.get("/api/tc/:documentId", async (req, reply) => {
    const { documentId } = req.params as { documentId: string };
    const doc = await getTcDocument(documentId);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    return { document: toDocumentSummary(doc), head: headVersion(doc) };
  });

  app.get("/api/tc/:documentId/history", async (req, reply) => {
    const { documentId } = req.params as { documentId: string };
    const doc = await getTcDocument(documentId);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    return {
      document: toDocumentSummary(doc),
      versions: toVersionSummaries(doc),
    };
  });

  app.get("/api/tc/:documentId/versions/:version", async (req, reply) => {
    const { documentId, version } = req.params as {
      documentId: string;
      version: string;
    };
    const doc = await getTcDocument(documentId);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    try {
      const parsed = Number(version);
      if (!Number.isInteger(parsed))
        throw new TcError(TC_ERROR.versionNotFound, version);
      return { document: toDocumentSummary(doc), version: getVersion(doc, parsed) };
    } catch (error) {
      return sendTcError(reply, error);
    }
  });

  app.delete("/api/tc/:documentId", async (req, reply) => {
    const { documentId } = req.params as { documentId: string };
    const removed = await deleteTcDocument(documentId);
    if (!removed) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.delete("/api/tc/:documentId/versions/:version", async (req, reply) => {
    const { documentId, version } = req.params as {
      documentId: string;
      version: string;
    };
    const doc = await getTcDocument(documentId);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    try {
      const parsed = Number(version);
      if (!Number.isInteger(parsed))
        throw new TcError(TC_ERROR.versionNotFound, version);
      const next = removeVersion(doc, parsed);
      if (next.versions.length === 0) {
        await deleteTcDocument(documentId);
        return { ok: true, deletedDocument: true };
      }
      await saveTcDocument(next);
      return {
        ok: true,
        deletedDocument: false,
        document: toDocumentSummary(next),
        head: headVersion(next),
        versions: toVersionSummaries(next),
      };
    } catch (error) {
      return sendTcError(reply, error);
    }
  });

  app.get("/api/tc/:documentId/markdown", async (req, reply) => {
    const { documentId } = req.params as { documentId: string };
    const doc = await getTcDocument(documentId);
    const head = doc ? headVersion(doc) : null;
    if (!doc || !head) return reply.code(404).send({ error: "not_found" });
    return reply.type("text/markdown; charset=utf-8").send(testCasesToMarkdown(head.cases));
  });

  app.post("/api/tc", async (req, reply) => {
    const body = req.body as { mermaidId?: unknown };
    if (typeof body.mermaidId !== "string" || !body.mermaidId)
      return reply.code(400).send({ error: "invalid_schema", message: "mermaidId가 필요합니다." });
    const mermaid = await getMermaid(body.mermaidId);
    if (!mermaid) return reply.code(404).send({ error: "mermaid_not_found" });
    if (!mermaid.mermaid.trim())
      return reply
        .code(400)
        .send({ error: TC_ERROR.emptyMermaid, message: "Mermaid가 비어 있어 TC를 만들 수 없습니다." });
    const dump = await getDump(mermaid.dumpId);
    if (!dump) return reply.code(404).send({ error: "dump_not_found" });
    try {
      const cases = generateTestCases(dump, mermaid.nodeMap);
      const documentId = tcDocumentId(dump.fileKey, dump.startNodeId);
      const existing = await getTcDocument(documentId);
      const next = existing
        ? addGeneratedVersion(
            existing,
            cases,
            mermaid.checksum,
            mermaid.id,
            dump.id,
          )
        : createDocument({
            documentId,
            figmaFileKey: dump.fileKey,
            figmaStartNodeId: dump.startNodeId,
            mermaidId: mermaid.id,
            dumpId: dump.id,
            mermaidChecksum: mermaid.checksum,
            cases,
          });
      await saveTcDocument(next);
      return reply.code(201).send({
        document: toDocumentSummary(next),
        head: headVersion(next),
      });
    } catch (error) {
      return sendTcError(reply, error);
    }
  });

  app.patch("/api/tc/:documentId", async (req, reply) => {
    const { documentId } = req.params as { documentId: string };
    const body = req.body as { cases?: unknown };
    const doc = await getTcDocument(documentId);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    if (!Array.isArray(body.cases))
      return reply.code(400).send({ error: "invalid_schema", message: "cases 배열이 필요합니다." });
    try {
      const cases = body.cases as TestCase[];
      validateCases(cases);
      const next = addEditVersion(doc, cases);
      await saveTcDocument(next);
      return { document: toDocumentSummary(next), head: headVersion(next) };
    } catch (error) {
      return sendTcError(reply, error);
    }
  });

  app.post("/api/tc/:documentId/restore", async (req, reply) => {
    const { documentId } = req.params as { documentId: string };
    const body = req.body as { version?: unknown };
    const doc = await getTcDocument(documentId);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    try {
      if (typeof body.version !== "number" || !Number.isInteger(body.version))
        throw new TcError(TC_ERROR.versionNotFound);
      const next = addRestoreVersion(doc, body.version);
      await saveTcDocument(next);
      return { document: toDocumentSummary(next), head: headVersion(next) };
    } catch (error) {
      return sendTcError(reply, error);
    }
  });
}
