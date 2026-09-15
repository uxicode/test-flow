import type { RunnerEvent, TestRunner } from "@testflow/runner-contract";
import { createPlaywrightRunner } from "@testflow/playwright-runner";
import { DATA_DIR_NAMES, resolveDataDir } from "@testflow/shared";
import { dataRoot } from "./data-root.js";
import { appendEvent } from "./run-store.js";

type SocketLike = { send: (data: string) => void };

const sockets = new Map<string, Set<SocketLike>>();
const persistTail = new Map<string, Promise<void>>();
let runner: TestRunner | null = null;

function persistAndBroadcast(event: RunnerEvent): Promise<void> {
  const previous = persistTail.get(event.runId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await appendEvent(event.runId, event);
      const listeners = sockets.get(event.runId);
      if (!listeners) return;
      const payload = JSON.stringify(event);
      for (const socket of listeners) {
        try {
          socket.send(payload);
        } catch {
          listeners.delete(socket);
        }
      }
    });
  persistTail.set(event.runId, next);
  return next;
}

export function getRunner(): TestRunner {
  if (runner) return runner;
  runner = createPlaywrightRunner({
    runsRoot: resolveDataDir(dataRoot(), DATA_DIR_NAMES.runs),
  });
  runner.subscribe((event) => {
    void persistAndBroadcast(event);
  });
  return runner;
}

export async function flushRunEvents(runId: string): Promise<void> {
  await persistTail.get(runId);
}

export function subscribeRunSocket(runId: string, socket: SocketLike): () => void {
  const set = sockets.get(runId) ?? new Set<SocketLike>();
  set.add(socket);
  sockets.set(runId, set);
  return () => {
    set.delete(socket);
    if (set.size === 0) sockets.delete(runId);
  };
}
