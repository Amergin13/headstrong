/**
 * Connects the stateless Gemini 2.5 Flash-Lite proxy (`/api/coach/generate`) as the fallback
 * model wherever Chrome does not expose a built-in on-device `LanguageModel` (Gemini Nano).
 * Imported for its side effect by screens that ask the coach or summary model.
 */
import { registerFallbackOnDeviceModel } from './onDeviceModel';
import {
  forgetLastFlashLiteExchange,
  isFlashLiteReady,
  promptFlashLite,
  resetFlashLiteConversation,
} from './geminiFlashLite';

registerFallbackOnDeviceModel({
  isReady: isFlashLiteReady,
  prompt: promptFlashLite,
  forgetLast: forgetLastFlashLiteExchange,
  resetConversation: resetFlashLiteConversation,
});
