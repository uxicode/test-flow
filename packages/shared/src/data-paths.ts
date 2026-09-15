export const DATA_DIR_NAMES = {
  figmaDumps: "figma-dumps",
  mermaid: "mermaid",
  tc: "tc",
  runs: "runs",
} as const;

export type DataDirName = (typeof DATA_DIR_NAMES)[keyof typeof DATA_DIR_NAMES];

export function resolveDataRoot(options: {
  repoRoot: string;
  envRoot?: string;
}): string {
  if (options.envRoot && options.envRoot.length > 0) return options.envRoot;
  return `${options.repoRoot.replace(/[/\\]$/, "")}/data`;
}

export function resolveDataDir(dataRoot: string, name: DataDirName): string {
  return `${dataRoot.replace(/[/\\]$/, "")}/${name}`;
}
