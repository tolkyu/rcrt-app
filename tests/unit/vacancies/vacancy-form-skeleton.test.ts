import { describe, expect, it } from 'vitest';
import {
  PROBATION_HINT,
  PROBATION_READ_ONLY_HINT,
  TEAM_LEAD_HINT,
  vacancyConditionsSkeleton,
  vacancyFormSkeleton,
} from '@/components/vacancies/vacancy-form-skeleton';
import { probationFieldShown, teamLeadFieldShown } from '@/lib/vacancy-form';
import messages from '@/messages/uk.json';

const GAMBLING = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const CRYPTO = '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081';

describe('create form skeleton and the Team Lead field share one rule [S3.2a]', () => {
  const offered = [
    { id: GAMBLING, canSetTeamLead: true },
    { id: CRYPTO, canSetTeamLead: false },
  ];
  const probation = [
    { id: GAMBLING, canSetProbation: true },
    { id: CRYPTO, canSetProbation: false },
  ];

  it.each([
    ['no vertical chosen, one allows it', offered, '', true],
    ['the chosen vertical allows it', offered, GAMBLING, true],
    ['the chosen vertical does not (Recruiter there)', offered, CRYPTO, false],
    ['no vertical chosen, none allows it', [offered[1]!], '', false],
    ['an unknown vertical', offered, 'x', false],
    ['nothing offered', [], '', false],
  ] as const)('%s → %s', (_name, verticals, verticalId, shown) => {
    expect(teamLeadFieldShown(verticals, verticalId)).toBe(shown);
  });

  it.each([
    ['no vertical chosen, one allows it', probation, '', true],
    ['the chosen vertical allows it (Admin)', probation, GAMBLING, true],
    ['the chosen vertical does not', probation, CRYPTO, false],
    ['no vertical chosen, none allows it', [probation[1]!], '', false],
    ['nothing offered', [], '', false],
  ] as const)('probation: %s → %s', (_name, verticals, verticalId, shown) => {
    expect(probationFieldShown(verticals, verticalId)).toBe(shown);
  });

  it('draws the Team Lead row only when the field is shown, with the reserved hint lines', () => {
    const without = vacancyFormSkeleton(false, false);
    const rows = vacancyFormSkeleton(true, false);
    expect(rows).toHaveLength(without.length + 1);
    expect(rows).toContainEqual({ kind: 'input', hint: TEAM_LEAD_HINT });
    expect(without).not.toContainEqual({
      kind: 'input',
      hint: TEAM_LEAD_HINT,
    });
  });

  it('group «Умови» has the probation input for the Admin and the read-only line for everyone else', () => {
    expect(vacancyConditionsSkeleton(true).at(-1)).toEqual([
      { kind: 'input', hint: PROBATION_HINT },
    ]);
    expect(vacancyConditionsSkeleton(false).at(-1)).toEqual({
      note: PROBATION_READ_ONLY_HINT,
    });
    expect(vacancyConditionsSkeleton(true)[0]).toBe('group');
  });

  it.each([
    [true, 'vacancyForm.rail.afterCreateAssigner'],
    [false, 'vacancyForm.rail.afterCreateSelf'],
  ] as const)(
    'sizes the after-create note using the author role (assigner: %s)',
    (assigner, message) => {
      for (const withProbation of [true, false]) {
        expect(vacancyFormSkeleton(assigner, withProbation).at(-1)).toEqual({
          note: { message },
          railHidden: true,
        });
      }
    },
  );

  it('the gallery sample used to measure the hint carries the real copy', () => {
    expect(messages.devUi.pageFrame.teamLeadHint).toBe(
      messages.vacancyForm.teamLead.hint,
    );
    expect(messages.devUi.pageFrame.teamLeadFieldLabel).toBe(
      messages.vacancyForm.teamLead.label,
    );
  });
});
