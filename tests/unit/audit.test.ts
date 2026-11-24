import { describe, expect, it } from 'vitest';
import { detailsSchema } from '@/server/audit';

describe('audit content field code allowlist [ADR-018, SEC-CORE-07]', () => {
  it('accepts the two fixed content field codes', () => {
    expect(
      detailsSchema.parse({ fields: ['descriptionDoc', 'requirementsDoc'] }),
    ).toEqual({ fields: ['descriptionDoc', 'requirementsDoc'] });
  });
  it.each([
    'arbitraryCamelCase',
    'descriptionDocExtra',
    'secret@example.test',
    'https://example.test/private',
    '<p>private</p>',
  ])('refuses arbitrary detail content %s', (value) => {
    expect(detailsSchema.safeParse({ fields: [value] }).success).toBe(false);
  });
  it('retains the PII key guard and existing safe scalar formats', () => {
    expect(
      detailsSchema.safeParse({ descriptionDoc: 'descriptionDoc' }).success,
    ).toBe(false);
    expect(
      detailsSchema.parse({
        method: 'MANAGER',
        count: 2,
        changed: true,
        fields: ['version'],
      }),
    ).toEqual({
      method: 'MANAGER',
      count: 2,
      changed: true,
      fields: ['version'],
    });
  });
});
