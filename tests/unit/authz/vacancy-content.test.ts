import { describe, expect, it } from 'vitest';
import { can } from '@/server/authz/can';
import { buildAuthContext } from '@/server/authz/context';
import type { Scope } from '@/server/authz/types';
import { canEditVacancyContent } from '@/server/authz/vacancy-content';
import {
  contextFor,
  CRYPTO,
  GAMBLING,
  ME,
  roleContext,
  vacancy,
} from './fixtures';

describe('content permission union [VAC-08, ADR-018]', () => {
  it.each(['ADMIN', 'HEAD_RECRUITER', 'RECRUITER', 'TEAM_LEAD'] as const)(
    '%s may edit its resource',
    (role) => {
      expect(
        canEditVacancyContent(
          roleContext(role),
          vacancy({
            teamLeadId: ME,
            assignedRecruiterIds: [ME],
          }),
        ),
      ).toBe(true);
    },
  );
  it.each(['HR', 'HEAD_HR', 'FINANCE'] as const)(
    '%s has no content grant',
    (role) => {
      expect(
        canEditVacancyContent(
          roleContext(role),
          vacancy({ teamLeadId: ME, assignedRecruiterIds: [ME] }),
        ),
      ).toBe(false);
    },
  );
  it('creator identity, pool visibility and self assignment confer no content grant', () => {
    const auth = roleContext('RECRUITER');
    expect(
      can(auth, 'vacancy.read', vacancy({ assignedRecruiterIds: [] })),
    ).toBe(true);
    expect(
      canEditVacancyContent(
        auth,
        vacancy({ createdBy: ME, assignedRecruiterIds: [] }),
      ),
    ).toBe(false);
  });
  it('denies other TL resources, foreign vertical and withheld GLOBAL grants', () => {
    expect(canEditVacancyContent(roleContext('TEAM_LEAD'), vacancy())).toBe(
      false,
    );
    expect(
      canEditVacancyContent(
        roleContext('RECRUITER'),
        vacancy({ verticalId: CRYPTO, assignedRecruiterIds: [ME] }),
      ),
    ).toBe(false);
    expect(canEditVacancyContent(roleContext('ADMIN', 'aal1'), vacancy())).toBe(
      false,
    );
  });
  it('unassignment keeps an independent own TL grant, with union per vertical', () => {
    const auth = contextFor([
      { role: 'RECRUITER', verticalId: GAMBLING },
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
      { role: 'HEAD_RECRUITER', verticalId: CRYPTO },
    ]);
    expect(
      canEditVacancyContent(
        auth,
        vacancy({ teamLeadId: ME, assignedRecruiterIds: [] }),
      ),
    ).toBe(true);
    expect(canEditVacancyContent(auth, vacancy({ verticalId: CRYPTO }))).toBe(
      true,
    );
    expect(canEditVacancyContent(auth, vacancy())).toBe(false);
  });
  it.each([
    'vacancy.update',
    'vacancy.hold',
    'vacancy.assign_recruiters',
    'vacancy.probation_length.set',
  ] as const)('does not grant Recruiter %s', (action) => {
    expect(
      can(
        roleContext('RECRUITER'),
        action,
        vacancy({ assignedRecruiterIds: [ME] }),
      ),
    ).toBe(false);
  });
  it.each([
    { kind: 'VERTICAL' },
    { kind: 'OWN' },
    { kind: 'ASSIGNED' },
  ] satisfies Scope[])(
    'custom narrow grants use central $kind scope',
    (scope) => {
      const auth = buildAuthContext(
        {
          userId: ME,
          roles: [{ role: 'custom:editor', verticalId: GAMBLING }],
          aal: 'aal1',
          timezone: 'UTC',
        },
        {
          'custom:editor': [{ permission: 'vacancy.content.update', scope }],
        },
      );
      expect(
        canEditVacancyContent(
          auth,
          vacancy({ teamLeadId: ME, assignedRecruiterIds: [ME] }),
        ),
      ).toBe(true);
      expect(
        canEditVacancyContent(
          auth,
          vacancy({
            verticalId: CRYPTO,
            teamLeadId: ME,
            assignedRecruiterIds: [ME],
          }),
        ),
      ).toBe(false);
    },
  );
});
