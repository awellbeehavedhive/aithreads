'use client';

import { createContext, useContext } from 'react';

export type SiteMode = 'default' | 'kids';

interface ModeContextType {
  mode: SiteMode;
  isKidsMode: boolean;
}

const defaultContext: ModeContextType = {
  mode: 'default',
  isKidsMode: false,
};

export const ModeContext = createContext<ModeContextType>(defaultContext);

export function useMode() {
  return useContext(ModeContext);
}

export function ModeProvider({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: SiteMode;
}) {
  const value: ModeContextType = {
    mode,
    isKidsMode: mode === 'kids',
  };

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
