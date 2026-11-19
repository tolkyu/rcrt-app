/** Straight and curly quotes, grave and acute accents that people type instead of the Ukrainian apostrophe ʼ (U+02BC). */
const APOSTROPHE_VARIANTS = /['‘’`´]/g;
const MODIFIER_APOSTROPHE = String.fromCharCode(0x02bc);

export const normalizeApostrophes = (value: string): string =>
  value.replace(APOSTROPHE_VARIANTS, MODIFIER_APOSTROPHE);
