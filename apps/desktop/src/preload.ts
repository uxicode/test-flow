import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("testflowDesktop", {
  isDesktop: true,
});
