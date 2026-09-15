import type { FastifyInstance } from "fastify";
import {
  INGEST_ERROR,
  INGEST_SOURCE,
  IngestError,
  SAMPLE_CHECKOUT_DUMP,
  type IngestErrorCode,
  ingestFromFigmaUrl,
  ingestFromUnknown,
  parseFigmaUrl,
} from "@testflow/figma-ingest";
import { deleteDump, getDump, listDumps, saveDump } from "./dump-store.js";
import {
  clearLocalFigmaToken,
  getTokenStatus,
  resolveFigmaToken,
  saveLocalFigmaToken,
} from "./figma-token.js";

function statusFor(code: IngestErrorCode): number {
  if (code === INGEST_ERROR.missingToken || code === INGEST_ERROR.figmaUnauthorized)
    return 401;
  if (code === INGEST_ERROR.figmaForbidden) return 403;
  if (code === INGEST_ERROR.nodeNotFound) return 404;
  if (code === INGEST_ERROR.figmaRequestFailed) return 502;
  return 400;
}

function sendIngestError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof IngestError)
    return reply.code(statusFor(error.code)).send({
      error: error.code,
      message: error.message,
    });
  throw error;
}

export async function registerFigmaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings/figma", async () => getTokenStatus());

  app.put("/api/settings/figma-token", async (req, reply) => {
    const body = req.body as { token?: unknown };
    try {
      if (typeof body.token !== "string")
        throw new IngestError(INGEST_ERROR.missingToken);
      return await saveLocalFigmaToken(body.token);
    } catch (error) {
      return sendIngestError(reply, error);
    }
  });

  app.delete("/api/settings/figma-token", async () => clearLocalFigmaToken());

  app.post("/api/figma-dumps/parse-url", async (req, reply) => {
    const body = req.body as { url?: unknown };
    try {
      if (typeof body.url !== "string")
        throw new IngestError(INGEST_ERROR.invalidUrl);
      return parseFigmaUrl(body.url);
    } catch (error) {
      return sendIngestError(reply, error);
    }
  });

  app.post("/api/figma-dumps/from-url", async (req, reply) => {
    const body = req.body as { url?: unknown };
    try {
      if (typeof body.url !== "string")
        throw new IngestError(INGEST_ERROR.invalidUrl);
      const { token } = await resolveFigmaToken();
      const dump = await ingestFromFigmaUrl({ url: body.url, token });
      const stored = await saveDump(dump, INGEST_SOURCE.figmaRest);
      return reply.code(201).send(stored);
    } catch (error) {
      return sendIngestError(reply, error);
    }
  });

  app.get("/api/figma-dumps/sample", async () => SAMPLE_CHECKOUT_DUMP);

  app.get("/api/figma-dumps", async () => ({ items: await listDumps() }));

  app.get("/api/figma-dumps/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const dump = await getDump(id);
    if (!dump) return reply.code(404).send({ error: "not_found" });
    return dump;
  });

  app.delete("/api/figma-dumps/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = await deleteDump(id);
    if (!removed) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/figma-dumps", async (req, reply) => {
    try {
      const body = req.body as { dump?: unknown } | unknown;
      const payload =
        body && typeof body === "object" && "dump" in body
          ? (body as { dump: unknown }).dump
          : body;
      const dump = ingestFromUnknown(payload);
      const stored = await saveDump(dump, INGEST_SOURCE.jsonFile);
      return reply.code(201).send(stored);
    } catch (error) {
      return sendIngestError(reply, error);
    }
  });
}
