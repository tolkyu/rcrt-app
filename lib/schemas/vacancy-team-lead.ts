import { z } from 'zod';
import { uuid } from './uuid';
import { expectedVersion } from './vacancy';

export const setVacancyTeamLeadSchema = z
  .object({ teamLeadId: uuid, expectedVersion })
  .strict()
  .meta({
    id: 'SetVacancyTeamLead',
    description:
      'Assigns the first Team Lead of an OPEN or ON_HOLD vacancy (D130 (3)); needs `vacancy.team_lead.set` (Head Recruiter of the vertical, Admin). The user must be an active, invited Team Lead of the vacancy vertical (D122), else 400 `invalid_team_lead` on `body.teamLeadId`. 409 `TEAM_LEAD_ALREADY_SET` when another Team Lead is set, 409 `VACANCY_CLOSED` outside OPEN/ON_HOLD, 409 `STALE_STATE` on a stale `expectedVersion`; the Team Lead already set writes nothing and answers 200.',
  });
export type SetVacancyTeamLeadInput = z.input<typeof setVacancyTeamLeadSchema>;
