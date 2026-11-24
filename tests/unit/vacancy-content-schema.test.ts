import { describe, expect, it } from 'vitest';
import {
  updateVacancyContentSchema,
  vacancyContentReadSchema,
  vacancyContentSchema,
} from '@/lib/schemas/vacancy-content';

const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
describe('distinct content read contract [ADR-019]', () => {
  const patchResponse = {
    id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    version: 1,
    updatedAt: '2026-11-19T08:00:00Z',
    descriptionDoc: null,
    requirementsDoc: doc,
  };
  it('requires both documents, status and eligibility without widening PATCH', () => {
    const read = { ...patchResponse, status: 'FILLED', canEditContent: false };
    expect(vacancyContentReadSchema.parse(read)).toEqual(read);
    expect(vacancyContentReadSchema.safeParse(patchResponse).success).toBe(
      false,
    );
    expect(vacancyContentSchema.safeParse(read).success).toBe(false);
    expect(vacancyContentSchema.parse(patchResponse)).toEqual(patchResponse);
    expect(
      vacancyContentReadSchema.safeParse({ ...read, descriptionDoc: undefined })
        .success,
    ).toBe(false);
  });
});
describe('content patch contract [ADR-018]', () => {
  it.each([
    { descriptionDoc: null },
    { requirementsDoc: doc },
    { descriptionDoc: doc, requirementsDoc: null },
  ])('preserves supplied fields and omission', (fields) => {
    expect(
      updateVacancyContentSchema.parse({ expectedVersion: 1, ...fields }),
    ).toEqual({ expectedVersion: 1, ...fields });
  });
  it.each([
    {},
    { expectedVersion: 1 },
    { expectedVersion: 0, descriptionDoc: null },
    { expectedVersion: 1.5, descriptionDoc: null },
    { descriptionDoc: null },
  ])('rejects missing documents/version or invalid version', (body) => {
    expect(updateVacancyContentSchema.safeParse(body).success).toBe(false);
  });
  it.each([
    'title',
    'status',
    'priority',
    'verticalId',
    'recruiterIds',
    'teamLeadId',
    'bonus',
    'probationDays',
    'unknown',
  ])('rejects overposting %s atomically', (field) => {
    expect(
      updateVacancyContentSchema.safeParse({
        expectedVersion: 1,
        descriptionDoc: doc,
        [field]: null,
      }).success,
    ).toBe(false);
  });
  it.each([
    '<p>HTML</p>',
    { type: 'doc', content: [{ type: 'image' }] },
    {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '\u0000' }] },
      ],
    },
  ])('rejects invalid content', (descriptionDoc) => {
    expect(
      updateVacancyContentSchema.safeParse({
        expectedVersion: 1,
        descriptionDoc,
      }).success,
    ).toBe(false);
  });
  it('reuses safe URL normalization and rejects unsafe URLs', () => {
    const linked = (href: string) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Link',
              marks: [{ type: 'link', attrs: { href } }],
            },
          ],
        },
      ],
    });
    expect(
      updateVacancyContentSchema.parse({
        expectedVersion: 1,
        descriptionDoc: linked('https://EXAMPLE.com'),
      }).descriptionDoc,
    ).toEqual(linked('https://example.com/'));
    expect(
      updateVacancyContentSchema.safeParse({
        expectedVersion: 1,
        requirementsDoc: linked('javascript:alert(1)'),
      }).success,
    ).toBe(false);
  });
  it('retains the inherited serialized document limit', () => {
    const descriptionDoc = {
      type: 'doc',
      content: Array.from({ length: 11 }, () => ({
        type: 'paragraph',
        content: [{ type: 'text', text: 'x'.repeat(4900) }],
      })),
    };
    expect(
      updateVacancyContentSchema.safeParse({
        expectedVersion: 1,
        descriptionDoc,
      }).success,
    ).toBe(false);
  });
});
