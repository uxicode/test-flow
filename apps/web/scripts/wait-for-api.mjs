import { setTimeout as delay } from "node:timers/promises";

const healthUrl = process.env.VITE_API_HEALTH_URL ?? "http://127.0.0.1:3001/health";
const maxAttempts = 60;

for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
  try {
    const res = await fetch(healthUrl);
    if (res.ok) process.exit(0);
  } catch {
    /* API still starting */
  }
  await delay(200);
}

console.warn(`[web] API not ready at ${healthUrl}; starting Vite anyway.`);
process.exit(0);
