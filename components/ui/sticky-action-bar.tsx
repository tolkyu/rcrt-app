import type { ReactNode } from 'react';

/**
 * Mobile bar for the page's primary action (G6): rides above the BottomNav; its 56 px reach `--sticky-bar-bottom`
 * (globals.css), which pads the app `<main>` and lifts the toasts. From md up it renders nothing visible.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-sticky-action-bar=""
      className="border-border bg-surface after:bg-surface fixed inset-x-0 bottom-(--chrome-bottom) z-10 flex h-14 items-center gap-2 border-t pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] after:absolute after:inset-x-0 after:top-full after:h-[env(safe-area-inset-bottom)] md:hidden [&>*]:flex-1"
    >
      {children}
    </div>
  );
}
