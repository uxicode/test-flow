export function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
    return null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
      return null;
    } catch {
      return null;
    }
  }
}
