import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RUN_LIMITS, type HealthResponse } from "@testflow/shared";
import { dataRoot, ensureDataDirs, repoRoot } from "./data-root.js";
import { registerFigmaRoutes } from "./figma-routes.js";
import { registerMermaidRoutes } from "./mermaid-routes.js";
import { registerRunRoutes } from "./run-routes.js";
import { registerTcRoutes } from "./tc-routes.js";
import { loadEnvFile } from "./load-env.js";

loadEnvFile();

const fastify = Fastify({ logger: true });
let isPrepared = false;

async function prepareApp(): Promise<void> {
  if (isPrepared) return;

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);
  const dirs = await ensureDataDirs();

  function health(): HealthResponse {
    return {
      ok: true,
      service: "testflow-api",
      dataRoot: dataRoot(),
      dataDirs: dirs,
      runLimits: {
        stepTimeoutMs: RUN_LIMITS.stepTimeoutMs,
        maxKeptRuns: RUN_LIMITS.maxKeptRuns,
      },
    };
  }

  fastify.get("/health", async (): Promise<HealthResponse> => health());
  fastify.get("/api/health", async (): Promise<HealthResponse> => health());

  await registerFigmaRoutes(fastify);
  await registerMermaidRoutes(fastify);
  await registerTcRoutes(fastify);
  await registerRunRoutes(fastify);

  const webDistDir =
    process.env.TESTFLOW_WEB_DIST_DIR ??
    path.join(repoRoot(), "apps", "web", "dist");
  const webIndex = path.join(webDistDir, "index.html");

  try {
    await fs.access(webIndex);
    await fastify.register(staticPlugin, {
      root: webDistDir,
      prefix: "/",
      wildcard: false,
      decorateReply: false,
    });
    fastify.setNotFoundHandler((req, reply) => {
      const url = (req.url ?? "").split("?")[0] ?? "";
      if (url.startsWith("/api") || url.startsWith("/health") || url.startsWith("/ws"))
        return reply.code(404).send({ error: "not_found" });
      return reply.sendFile("index.html");
    });
  } catch {
    fastify.log.info(
      { webDistDir },
      "Web dist not found; use Vite dev server for UI (pnpm dev).",
    );
  }

  isPrepared = true;
}

export async function startServer(options?: {
  port?: number;
  host?: string;
}): Promise<void> {
  await prepareApp();
  const port = options?.port ?? Number(process.env.PORT ?? 3001);
  const host = options?.host ?? process.env.HOST ?? "0.0.0.0";
  await fastify.listen({ port, host });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await startServer({
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
  });
}
