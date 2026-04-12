import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("testflowDesktop", {
  kind: "desktop" as const,
});
