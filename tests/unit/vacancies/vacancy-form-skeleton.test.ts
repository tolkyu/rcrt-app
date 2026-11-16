import { describe, expect, it } from 'vitest';
import {
  TEAM_LEAD_HINT_LINES,
  vacancyFormSkeleton,
} from '@/components/vacancies/vacancy-form-skeleton';
import { teamLeadFieldShown } from '@/lib/vacancy-form';
import messages from '@/messages/uk.json';

const GAMBLING = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const CRYPTO = '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081';

describe('create form skeleton and the Team Lead field share one rule [S3.2a]', () => {
  const offered = [
    { id: GAMBLING, canSetTeamLead: true },
    { id: CRYPTO, canSetTeamLead: false },
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

  it('draws the Team Lead row only when the field is shown, with the reserved hint lines', () => {
    expect(vacancyFormSkeleton(false)).toHaveLength(4);
    const rows = vacancyFormSkeleton(true);
    expect(rows).toHaveLength(5);
    expect(rows.at(-1)).toEqual({ kind: 'input', hint: TEAM_LEAD_HINT_LINES });
  });

  it('the gallery sample used to measure the hint carries the real copy', () => {
    expect(messages.devUi.pageFrame.teamLeadHint).toBe(
      messages.vacancyForm.teamLead.hint,
    );
    expect(messages.devUi.pageFrame.teamLeadFieldLabel).toBe(
      messages.vacancyForm.teamLead.label,
    );
  });
});
