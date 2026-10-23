/// <reference lib="webworker" />
// Runs the on-device coach model off the main thread so the app stays smooth while it thinks.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
