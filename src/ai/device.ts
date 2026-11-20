import type { Availability, DeviceStatus } from '../types';

/** Same session options the engine gives Firebase AI Logic for on-device models. */
export const EN_TEXT = { type: 'text' as const, languages: ['en'] };
export const DEVICE_CREATE_OPTIONS = { expectedInputs: [EN_TEXT], expectedOutputs: [EN_TEXT] };

interface LanguageModelLike {
  availability(options?: object): Promise<Availability>;
}

function languageModel(): LanguageModelLike | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelLike }).LanguageModel;
}

/**
 * Asks Chrome directly whether Gemini Nano can run here.
 *
 * Why we do this ourselves: when `LanguageModel` is missing, Firebase AI Logic creates no
 * on-device adapter and sends every request to the cloud, even with ONLY_ON_DEVICE. So raw
 * student work is only handed to the SDK after this check says "available".
 */
export async function probeDevice(): Promise<DeviceStatus> {
  const lm = languageModel();
  if (!lm?.availability) return { api: false, text: 'unavailable' };
  try {
    return { api: true, text: await lm.availability(DEVICE_CREATE_OPTIONS) };
  } catch {
    return { api: true, text: 'unavailable' };
  }
}

export class DeviceNotReadyError extends Error {
  constructor(public status: DeviceStatus) {
    super(
      status.api
        ? `Gemini Nano is ${status.text} on this device.`
        : 'This browser has no on-device AI (Chrome Prompt API).',
    );
    this.name = 'DeviceNotReadyError';
  }
}

/** Privacy gate: throws unless the next ONLY_ON_DEVICE call is guaranteed to stay local. */
export async function assertDeviceReady(): Promise<void> {
  const status = await probeDevice();
  if (!status.api || status.text !== 'available') throw new DeviceNotReadyError(status);
}
