'use client';

import { createContext, useContext } from 'react';

/** What the list does when a draft leaves it (published) or comes back (publish refused): selection and focus follow the row. */
export interface DraftLeave {
  /** `false` when the list does not hold the row (or is gone), so the caller applies its own focus rule. */
  readonly removed: (id: string) => boolean;
  readonly restored: (id: string) => boolean;
  /** The publish went through: nothing of this draft needs remembering. */
  readonly settled: (id: string) => void;
}

const DraftLeaveContext = createContext<DraftLeave | null>(null);

export const DraftLeaveProvider = DraftLeaveContext.Provider;

/** `null` outside the list (the card page), where the row logic does not apply. */
export const useDraftLeave = () => useContext(DraftLeaveContext);
