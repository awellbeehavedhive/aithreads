'use client';

import { ModeProvider, SiteMode } from '@/lib/mode-context';

interface KidsLayoutProps {
  children: React.ReactNode;
  mode: SiteMode;
}

/**
 * Mode-aware layout wrapper
 * Provides mode context to all children and applies mode-specific styling
 */
export function KidsLayout({ children, mode }: KidsLayoutProps) {
  return (
    <ModeProvider mode={mode}>
      <div className={mode === 'kids' ? 'kids-mode' : ''}>
        {children}
      </div>
    </ModeProvider>
  );
}
