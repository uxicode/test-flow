import fs from "node:fs/promises";
import path from "node:path";

export async function rotateRuns(runsRoot: string, maxKept: number): Promise<number> {
  await fs.mkdir(runsRoot, { recursive: true });
  const names = await fs.readdir(runsRoot);
  const dirs: { name: string; mtime: number }[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = path.join(runsRoot, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isDirectory()) continue;
    dirs.push({ name, mtime: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  const extra = dirs.slice(maxKept);
  await Promise.all(
    extra.map((dir) => fs.rm(path.join(runsRoot, dir.name), { recursive: true, force: true })),
  );
  return extra.length;
}
