import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import "./load-env.js";
import { registerRoutes } from "./routes.js";

const port = Number(process.env.PORT || 8787);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);
await registerRoutes(app);

await app.listen({ port, host: "0.0.0.0" });
