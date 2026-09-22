export interface LogMeta {
  caseId?: string;
  runStatus?: string;
  report?: string;
}

export interface LogEvent {
  channelId: string;
  message: string;
  at: string;
  caseId?: string;
  runStatus?: string;
  report?: string;
}

interface Channel {
  events: LogEvent[];
  listeners: Set<(event: LogEvent) => void>;
}

const channels = new Map<string, Channel>();

function channel(channelId: string): Channel {
  const current = channels.get(channelId);
  if (current) return current;
  const created: Channel = { events: [], listeners: new Set() };
  channels.set(channelId, created);
  return created;
}

export function publishLog(channelId: string, message: string, meta?: LogMeta): LogEvent {
  const event: LogEvent = {
    channelId,
    message,
    at: new Date().toISOString(),
    ...(meta?.caseId ? { caseId: meta.caseId } : {}),
    ...(meta?.runStatus ? { runStatus: meta.runStatus } : {}),
    ...(meta?.report ? { report: meta.report } : {}),
  };
  const current = channel(channelId);
  current.events.push(event);
  for (const listener of current.listeners) listener(event);
  return event;
}

export function readLogs(channelId: string): LogEvent[] {
  return [...(channels.get(channelId)?.events ?? [])];
}

export function subscribeLog(
  channelId: string,
  listener: (event: LogEvent) => void,
): () => void {
  const current = channel(channelId);
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
  };
}
