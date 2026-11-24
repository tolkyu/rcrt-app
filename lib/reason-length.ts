import { normalizeReason } from '@/lib/reason-text';

/** Vacancy cancel reason, in code points after normalisation. */
export const VACANCY_REASON_MAX = 500;

/** What the server counts against the maximum (Unicode code points after `normalizeReason`), so a client counter and the schema cannot disagree. Apart from `reason-text` so the form bundles do not carry it. */
export const reasonLength = (value: string): number =>
  Array.from(normalizeReason(value)).length;
