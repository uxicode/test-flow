export interface VisionScreen {
  id: string;
  name: string;
  text?: string;
  group?: string;
}

export interface VisionConnection {
  from: string;
  to: string;
  label?: string;
}

export interface VisionFlowResult {
  screens: VisionScreen[];
  connections: VisionConnection[];
}

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_VISION_MODEL = "qwen2.5vl:7b";
