/**
 * Connects the downloadable phone-GPU model as the fallback on-device model (used where Chrome
 * doesn't expose Gemini Nano, e.g. Chrome on Android). Imported for its side effect by every
 * screen that asks the on-device model something.
 */
import { registerFallbackOnDeviceModel } from './onDeviceModel';
import { isGpuModelReady, promptGpuModel } from './gpuModel';

registerFallbackOnDeviceModel({ isReady: isGpuModelReady, prompt: promptGpuModel });
