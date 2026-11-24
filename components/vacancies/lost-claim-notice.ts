'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from '@/lib/toast';

const KEY = 'vacancy-claim-lost';
/** The access-loss reload follows the failed claim within one card read; anything older is not that reload. */
const MAX_AGE_MS = 10_000;
const NUMBER = /^V-\d{1,9}$/;
const ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

interface LostClaim {
  id: string;
  number: string;
}

/** Kept per tab for the reload the access-loss handler may start right after a lost claim (D132); ids only, no personal data. */
export function rememberLostClaim({ id, number }: LostClaim) {
  try {
    if (!ID.test(id) || !NUMBER.test(number)) return;
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ at: Date.now(), id, number }),
    );
  } catch {
    return;
  }
}

export function forgetLostClaim() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
}

/** A reload the user asked for or a history step comes after the toast was already seen. */
function startedByNavigation() {
  if (typeof PerformanceNavigationTiming === 'undefined') return true;
  const [entry] = performance.getEntriesByType('navigation');
  return (
    !(entry instanceof PerformanceNavigationTiming) || entry.type === 'navigate'
  );
}

interface StoredClaim extends LostClaim {
  at: number;
}

function parse(raw: string): StoredClaim | null {
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('at' in value && 'id' in value && 'number' in value)
  )
    return null;
  const { at, id, number } = value;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (typeof number !== 'string' || !NUMBER.test(number)) return null;
  return { at, id, number };
}

/** `vacancyId` limits the notice to one card; another card's notice stays for the list. */
function takeLostClaim(vacancyId?: string): LostClaim | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const lost = parse(raw);
    if (lost && vacancyId && lost.id !== vacancyId.toLowerCase()) return null;
    // Written by this document: its toast is on screen, and the reload that may follow is the one to repeat it.
    if (lost && performance.timeOrigin < lost.at) return null;
    window.sessionStorage.removeItem(KEY);
    if (!lost || !startedByNavigation()) return null;
    const age = Date.now() - lost.at;
    return age >= 0 && age <= MAX_AGE_MS
      ? { id: lost.id, number: lost.number }
      : null;
  } catch {
    return null;
  }
}

/** Shows the lost-claim warning once on the first render after that reload (list, or the card's 404 with `vacancyId`); the same toast id replaces one still on screen. */
export function useLostClaimNotice(vacancyId?: string) {
  const t = useTranslations('vacancies.team.claimDialog');
  useEffect(() => {
    const lost = takeLostClaim(vacancyId);
    if (!lost) return;
    toast.warning(t('lost'), {
      description: t('lostDescription', { number: lost.number }),
      id: `claim:${lost.id}`,
      duration: 6000,
    });
  }, [t, vacancyId]);
}

/** Lazy target of the card's 404 view. */
export default function LostClaimNotice({ id }: { id: string }) {
  useLostClaimNotice(id);
  return null;
}
