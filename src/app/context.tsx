import { createContext, useContext } from 'react';
import type { Engine, RuntimeConfig } from '../ai/engine';
import type { FirebaseServices } from '../firebase';
import type { DeviceStatus } from '../types';

export interface AppCtx {
  engine: Engine;
  cfg: RuntimeConfig & { source: string };
  services: FirebaseServices | null;
  device: DeviceStatus | null;
  refreshDevice: () => Promise<void>;
  uid: string | null;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('App context missing');
  return v;
}
