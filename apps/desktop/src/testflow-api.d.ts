export {};

declare global {
  interface Window {
    testflowDesktop?: {
      isDesktop: boolean;
    };
  }
}
