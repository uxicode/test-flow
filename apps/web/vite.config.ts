import { networkInterfaces } from "node:os";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = 8787;

async function apiOrigin(): Promise<string> {
  const hosts = ["127.0.0.1"];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) hosts.push(entry.address);
    }
  }
  for (const host of hosts) {
    try {
      const response = await fetch(`http://${host}:${apiPort}/api/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://www.figma.com/design/probe/file", token: "" }),
      });
      const text = await response.text();
      if (text.includes("FIGMA_TOKEN 환경변수")) continue;
      if (response.ok || response.status === 400) return `http://${host}:${apiPort}`;
    } catch {
      continue;
    }
  }
  return `http://127.0.0.1:${apiPort}`;
}

export default defineConfig(async () => {
  const httpTarget = await apiOrigin();
  const wsTarget = httpTarget.replace(/^http:/u, "ws:");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 9000,
      proxy: {
        "/api": httpTarget,
        "/ws": {
          target: wsTarget,
          ws: true,
        },
      },
    },
  };
});
