import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { can, permissionsFor } from '@/server/authz/can';
import {
  authorsAnywhere,
  grantCovers,
  vacancyAuthorKind,
  vacancyAuthorVerticals,
} from '@/server/authz/vacancy-author';
import {
  vacancyEventReadWhere,
  vacancyReadWhere,
} from '@/server/authz/vacancy-scope';
import type { BuiltinRole } from '@/server/authz/types';
import {
  contextFor,
  CRYPTO,
  GAMBLING,
  ME,
  OTHER,
  roleContext,
  vacancy,
} from './fixtures';

const dialect = new PgDialect();
const render = (
  ctx: ReturnType<typeof roleContext>,
  status?: Parameters<typeof vacancyReadWhere>[1],
) => dialect.sqlToQuery(vacancyReadWhere(ctx, status));

describe('full-form vacancy authors [VAC-03, D77, D87, D89]', () => {
  it.each<[BuiltinRole, 'ASSIGNER' | 'SELF_ASSIGNER' | null]>([
    ['ADMIN', 'ASSIGNER'],
    ['HEAD_RECRUITER', 'ASSIGNER'],
    ['RECRUITER', 'SELF_ASSIGNER'],
    ['TEAM_LEAD', null],
    ['HEAD_HR', null],
    ['HR', null],
    ['FINANCE', null],
  ])('%s in the vertical is %s', (role, expected) => {
    expect(vacancyAuthorKind(roleContext(role), GAMBLING)).toBe(expected);
  });

  it.each<[BuiltinRole, boolean]>([
    ['ADMIN', true],
    ['HEAD_RECRUITER', true],
    ['RECRUITER', true],
    ['TEAM_LEAD', false],
    ['HEAD_HR', false],
    ['HR', false],
    ['FINANCE', false],
  ])('the draft-route gate for %s is %s', (role, expected) => {
    expect(authorsAnywhere(roleContext(role))).toBe(expected);
  });

  it('keeps the vertical bound for vertical roles and drops Admin while MFA is pending', () => {
    expect(vacancyAuthorKind(roleContext('RECRUITER'), CRYPTO)).toBeNull();
    expect(vacancyAuthorKind(roleContext('HEAD_RECRUITER'), CRYPTO)).toBeNull();
    expect(vacancyAuthorKind(roleContext('ADMIN'), CRYPTO)).toBe('ASSIGNER');
    expect(
      vacancyAuthorKind(roleContext('ADMIN', 'aal1'), GAMBLING),
    ).toBeNull();
  });

  it('lets a Team Lead who is also a Recruiter of the vertical use the full form as a Recruiter (D35)', () => {
    const ctx = contextFor([
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
      { role: 'RECRUITER', verticalId: GAMBLING },
    ]);
    expect(vacancyAuthorKind(ctx, GAMBLING)).toBe('SELF_ASSIGNER');
  });

  it('resolves mixed roles per vertical, preferring the manager reading', () => {
    const ctx = contextFor([
      { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
      { role: 'RECRUITER', verticalId: CRYPTO },
    ]);
    expect(vacancyAuthorKind(ctx, GAMBLING)).toBe('ASSIGNER');
    expect(vacancyAuthorKind(ctx, CRYPTO)).toBe('SELF_ASSIGNER');
    const { any } = vacancyAuthorVerticals(ctx);
    expect(any === 'ALL' ? any : [...any].sort()).toEqual(
      [CRYPTO, GAMBLING].sort(),
    );
  });

  it('gates the Team Lead and probation fields by their own permissions, not by the author kind', () => {
    expect(
      grantCovers(roleContext('RECRUITER'), 'vacancy.team_lead.set', GAMBLING),
    ).toBe(false);
    expect(
      grantCovers(
        roleContext('HEAD_RECRUITER'),
        'vacancy.team_lead.set',
        GAMBLING,
      ),
    ).toBe(true);
    expect(
      grantCovers(
        roleContext('HEAD_RECRUITER'),
        'vacancy.probation_length.set',
        GAMBLING,
      ),
    ).toBe(false);
    expect(
      grantCovers(roleContext('ADMIN'), 'vacancy.probation_length.set', CRYPTO),
    ).toBe(true);
    expect(
      grantCovers(
        roleContext('HEAD_HR'),
        'vacancy.probation_length.set',
        GAMBLING,
      ),
    ).toBe(true);
  });
});

describe('DRAFT belongs to its author alone [D92, D98]', () => {
  const draft = (createdBy = OTHER) =>
    vacancy({ status: 'DRAFT', createdBy, teamLeadId: null });

  it.each<BuiltinRole>([
    'ADMIN',
    'HEAD_RECRUITER',
    'HEAD_HR',
    'HR',
    'TEAM_LEAD',
  ])('%s has no permission on another user’s draft', (role) => {
    const ctx = roleContext(role);
    expect(permissionsFor(ctx, draft())).toEqual(new Set());
    expect(can(ctx, 'vacancy.read', draft())).toBe(false);
  });

  it('a Recruiter who is not the author, assigned or not, sees nothing of it', () => {
    const ctx = roleContext('RECRUITER');
    expect(
      can(ctx, 'vacancy.read', { ...draft(), assignedRecruiterIds: [ME] }),
    ).toBe(false);
  });

  it('the author keeps the grants of their own role on it, Admin included', () => {
    expect(can(roleContext('ADMIN'), 'vacancy.read', draft(ME))).toBe(true);
    expect(
      can(roleContext('HEAD_RECRUITER'), 'vacancy.update', draft(ME)),
    ).toBe(true);
  });

  it('an author who no longer holds a vacancy-creating role in the vertical is denied, as the SQL predicate does [D98]', () => {
    const asHeadHr = roleContext('HEAD_HR');
    expect(can(asHeadHr, 'vacancy.read', draft(ME))).toBe(false);
    expect(permissionsFor(asHeadHr, draft(ME))).toEqual(new Set());
    expect(can(roleContext('TEAM_LEAD'), 'vacancy.read', draft(ME))).toBe(
      false,
    );
    expect(
      can(roleContext('RECRUITER'), 'vacancy.read', {
        ...draft(ME),
        verticalId: CRYPTO,
      }),
    ).toBe(false);
  });

  it('treats a draft its author cancelled like a draft, and a vacancy cancelled after opening like any other [D92, D82]', () => {
    const cancelled = (createdBy: string, neverOpened: boolean) =>
      vacancy({
        status: 'CANCELLED',
        createdBy: createdBy as typeof ME,
        neverOpened,
      });
    for (const role of ['ADMIN', 'HEAD_RECRUITER', 'HEAD_HR'] as const)
      expect(
        can(roleContext(role), 'vacancy.read', cancelled(OTHER, true)),
      ).toBe(false);
    expect(can(roleContext('ADMIN'), 'vacancy.read', cancelled(ME, true))).toBe(
      true,
    );
    expect(
      can(roleContext('HEAD_HR'), 'vacancy.read', cancelled(ME, true)),
    ).toBe(false);
    expect(
      can(roleContext('ADMIN'), 'vacancy.read', cancelled(OTHER, false)),
    ).toBe(true);
  });

  it('applies the draft rule only to drafts', () => {
    expect(
      can(roleContext('ADMIN'), 'vacancy.read', vacancy({ createdBy: OTHER })),
    ).toBe(true);
  });
});

describe('the one vacancy read predicate [D92]', () => {
  it('keeps a cancelled draft out of the role arm and gives it to its author through its own arm', () => {
    const all = render(roleContext('ADMIN'));
    expect(all.sql).toContain('"opened_at" is null');
    expect(all.sql).toContain('not (');
    const cancelled = render(roleContext('ADMIN'), 'CANCELLED');
    expect(cancelled.params).toEqual(
      expect.arrayContaining(['CANCELLED', 'DRAFT', ME]),
    );
    expect(cancelled.sql).toContain('"opened_at" is null');
    expect(render(roleContext('ADMIN'), 'OPEN').sql).not.toContain('opened_at');
    expect(render(roleContext('ADMIN'), 'DRAFT').sql).not.toContain(
      'opened_at',
    );
  });

  it('ties every draft to the caller, so another author’s id never matches', () => {
    const query = render(roleContext('ADMIN'));
    expect(query.sql).toContain('"status" <> $1');
    expect(query.sql).toContain('"status" = $');
    expect(query.sql).toContain('"created_by" = $');
    expect(query.params).toContain('DRAFT');
    expect(query.params).toContain(ME);
  });

  it('matches no draft for a role that cannot author one', () => {
    for (const role of ['HR', 'HEAD_HR', 'TEAM_LEAD'] as const)
      expect(render(roleContext(role)).sql).toContain('false');
  });

  it('limits a vertical author to the verticals where they may create', () => {
    const query = render(roleContext('RECRUITER'));
    expect(query.params).toContain(GAMBLING);
    expect(render(roleContext('ADMIN')).sql).toContain('true');
  });
});

describe('the one event read predicate [D92, SEC-VC-06]', () => {
  const eventWhere = (ctx: ReturnType<typeof roleContext>) =>
    dialect.sqlToQuery(vacancyEventReadWhere(ctx));

  it('is row-local: events without a vacancy pass, draft-era rows (no vertical) pass only for their actor, with every column qualified', () => {
    const query = eventWhere(roleContext('RECRUITER'));
    expect(query.sql).toContain('"entity_event"."vacancy_id" is null');
    expect(query.sql).toContain(
      '"entity_event"."vertical_id" is null and "entity_event"."actor_id" = $',
    );
    expect(query.sql).toContain('"entity_event"."vertical_id" is not null and');
    expect(query.params).toContain(ME);
  });

  it('never reads the vacancy for the draft rule or for a vertical-wide role: the vertical on the event row is the scope', () => {
    for (const role of ['ADMIN', 'HEAD_RECRUITER', 'HR'] as const)
      expect(eventWhere(roleContext(role)).sql, role).not.toContain(
        'from "app"."vacancy"',
      );
    const head = eventWhere(roleContext('HEAD_RECRUITER'));
    expect(head.sql).toContain('"entity_event"."vertical_id" in ($');
    expect(head.params).toContain(GAMBLING);
  });

  it('probes the vacancy by primary key only for the per-vacancy scopes (own Team Lead vacancies, assigned or unassigned recruiter work)', () => {
    for (const role of ['TEAM_LEAD', 'RECRUITER'] as const) {
      const { sql } = eventWhere(roleContext(role));
      expect(sql, role).toContain(
        'exists (select 1 from "app"."vacancy" where "app"."vacancy"."id" = "entity_event"."vacancy_id"',
      );
    }
  });

  it('matches no vacancy event for a role without vacancy access beyond the author rule', () => {
    for (const role of ['FINANCE'] as const)
      expect(eventWhere(roleContext(role)).sql, role).toContain('false');
  });
});

const SOURCE_ROOTS = ['server', 'app', 'lib', 'components', 'scripts'];
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Only these modules may read or write the vacancy tables, so every vacancy read goes through `vacancyReadWhere` (D92). */
const VACANCY_TABLE_MODULES = [
  'server/authz/vacancy-scope.ts',
  'server/db/seed/vacancies.ts',
  'server/repositories/position.ts',
  'server/repositories/vacancy-work.ts',
  'server/repositories/vacancy.ts',
];
const TABLE_IMPORT =
  /import\s*\{[^}]*(?:vacancy|vacancyRecruiter)[^}]*\}\s*from\s*'[^']*db\/schema'/;
const TABLE_NAMESPACE = /schema\.(?:vacancy|vacancyRecruiter)/;

describe('vacancy read paths cannot bypass the draft rule [D92]', () => {
  const files = SOURCE_ROOTS.flatMap(sources).map((file) => ({
    path: relative('.', file).split(sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }));

  it('only the allowlisted modules touch the vacancy tables', () => {
    const offenders = files
      .filter(
        ({ text }) => TABLE_IMPORT.test(text) || TABLE_NAMESPACE.test(text),
      )
      .map(({ path }) => path)
      .filter((path) => !VACANCY_TABLE_MODULES.includes(path));
    expect(offenders).toEqual([]);
  });

  it('the allowlist is not stale: every listed module still uses a vacancy table', () => {
    for (const allowed of VACANCY_TABLE_MODULES) {
      const file = files.find(({ path }) => path === allowed);
      expect(file, allowed).toBeDefined();
      expect(
        TABLE_IMPORT.test(file!.text) || TABLE_NAMESPACE.test(file!.text),
        allowed,
      ).toBe(true);
    }
  });

  /** Readers of `entity_event`: a new one must apply `vacancyEventReadWhere` to vacancy events (D92) and then be listed here. */
  const EVENT_MODULES = [
    'server/authz/vacancy-scope.ts',
    'server/db/seed/index.ts',
    'server/events/index.ts',
    'server/repositories/user.ts',
  ];
  const EVENT_TABLE =
    /import\s*\{[^}]*(?:entityEvent|changeFeed)[^}]*\}\s*from\s*'[^']*db\/schema'|schema\.(?:entityEvent|changeFeed)/;
  /** Raw SQL, `sql.identifier` or a view reaches the same tables without the Drizzle import; comments are not code. */
  const EVENT_SQL_NAME = /\b(?:entity_event|change_feed)\b/;
  const code = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('only the allowlisted modules touch entity_event, so no timeline reader can skip the draft rule', () => {
    const offenders = files
      .filter(({ text }) => EVENT_TABLE.test(text))
      .map(({ path }) => path)
      .filter((path) => path !== 'server/db/schema.ts')
      .filter((path) => !EVENT_MODULES.includes(path));
    expect(offenders).toEqual([]);
  });

  it('no module reaches entity_event or change_feed through raw SQL outside the allowlist', () => {
    const offenders = files
      .filter(({ text }) => EVENT_SQL_NAME.test(code(text)))
      .map(({ path }) => path)
      .filter((path) => path !== 'server/db/schema.ts')
      .filter((path) => !EVENT_MODULES.includes(path));
    expect(offenders).toEqual([]);
  });

  it('the only existing timeline reader selects user events, never vacancy events', () => {
    const reader = files.find(
      ({ path }) => path === 'server/repositories/user.ts',
    )!;
    expect(reader.text).toMatch(/e\.type like 'user\.%'/);
    expect(reader.text).not.toMatch(/vacancy_id/);
  });

  it('keeps the role scope adapter private to its module', () => {
    const offenders = files
      .filter(({ path }) => path !== 'server/authz/vacancy-scope.ts')
      .filter(({ text }) => /vacancyScope/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
