'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { getEngine, type Engine, type SyncStatus } from '../engine';

const Ctx = createContext<Engine | null>(null);

/** Tests give components their own engine; the site uses the page's. */
export function SyncEngineProvider({ engine, children }: { engine: Engine; children: ReactNode }) {
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}

export const useEngine = (): Engine => useContext(Ctx) ?? getEngine();

const SERVER: SyncStatus = { active: false, phase: 'idle', pending: 0, failing: false, hasSetAside: false, error: null };

export function useSyncStatus(): SyncStatus {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getStatus, () => SERVER);
}
