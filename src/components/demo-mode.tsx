"use client";

import { createContext, useContext } from "react";

const DemoModeContext = createContext(false);

// The server supplies this public UI flag so SSR and hydration render the same nav.
export function DemoModeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <DemoModeContext.Provider value={enabled}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
