import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { migrateDatabase } from '../../server/db/migrate';
import { seedDemo } from '../../server/db/seed/index';
import {
  connectTestDatabase,
  phaseOneTables,
  testDatabaseUrls,
} from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const runtime = connectTestDatabase(urls.runtime);
const verticalId = randomUUID();
const otherVerticalId = randomUUID();
const userId = randomUUID();
const anotherUserId = randomUUID();

afterAll(async () => {
  await Promise.all([admin.end(), runtime.end()]);
});

async function snapshot() {
  const rows = await Promise.all(
    phaseOneTables.map(
      async (table) =>
        [
          table,
          await admin.unsafe(
            `select to_jsonb(t) as row from app.${table} t order by to_jsonb(t)::text`,
          ),
        ] as const,
    ),
  );
  return Object.fromEntries(rows);
}

describe('Phase 1 PostgreSQL migrations [FND-1, ROLE-01, HIST-03, AUD]', () => {
  it('refuses destructive test setup for hosted, non-test or mismatched targets', () => {
    const source = {
      TEST_DATABASE_URL: urls.migration,
      TEST_DATABASE_RUNTIME_URL: urls.runtime,
    };
    const otherDatabase = new URL(urls.migration);
    otherDatabase.pathname = '/postgres';
    for (const value of [
      undefined,
      'postgresql://recruiting_test:unused@192.0.2.1/recruiting_test',
      'postgresql://recruiting_test:unused@localhost.evil.invalid/recruiting_test',
      otherDatabase.toString(),
      `${urls.migration}?host=192.0.2.1`,
    ]) {
      expect(() =>
        testDatabaseUrls({ ...source, TEST_DATABASE_URL: value }),
      ).toThrow(/test database URL/);
    }
    const differentServer = new URL(urls.runtime);
    differentServer.port = differentServer.port === '55333' ? '55334' : '55333';
    expect(() =>
      testDatabaseUrls({
        ...source,
        TEST_DATABASE_RUNTIME_URL: differentServer.toString(),
      }),
    ).toThrow('same server');
  });

  it('migrates an empty PostgreSQL 16 database and reruns without changing data', async () => {
    const tables = await admin`
      select tablename from pg_tables where schemaname = 'app' order by tablename
    `;
    expect(tables.map((row) => row.tablename)).toEqual(phaseOneTables);
    const before = await snapshot();
    expect(Object.values(before).every((rows) => rows.length === 0)).toBe(true);
    await migrateDatabase(urls.migration);
    expect(await snapshot()).toEqual(before);
  });

  it('allows app_rw to create and edit ordinary records without owning them', async () => {
    await runtime`insert into app.vertical (id, name) values
      (${verticalId}, 'Перевірка QA'), (${otherVerticalId}, 'Інша вертикаль QA')`;
    await runtime`insert into app.app_user (id, email, full_name) values
      (${userId}, 'qa.one@demo', 'Перевірка Один'),
      (${anotherUserId}, 'qa.two@demo', 'Перевірка Два')`;
    const changed =
      await runtime`update app.app_user set full_name = 'Оновлене ім’я'
      where id = ${userId} returning full_name`;
    expect(changed[0]?.full_name).toBe('Оновлене ім’я');
    const roles = await admin`
      select rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_roles where rolname = 'app_rw'
    `;
    expect(roles).toMatchObject([
      {
        rolname: 'app_rw',
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: true,
      },
    ]);
    const owners = await admin`
      select tableowner from pg_tables where schemaname = 'app'
    `;
    expect(owners.every((row) => row.tableowner === 'app_migrator')).toBe(true);
    const membership = await admin`select
      pg_has_role('app_rw', 'app_migrator', 'MEMBER') as migrator,
      pg_has_role('app_rw', 'app_purge', 'MEMBER') as purge`;
    expect(membership).toMatchObject([{ migrator: false, purge: false }]);
    await expect(
      runtime`create table app.forbidden_ddl (id integer)`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(runtime`set role app_purge`).rejects.toMatchObject({
      code: '42501',
    });
    await expect(runtime`set role app_migrator`).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('enforces normalized and unique user emails [ROLE-05]', async () => {
    await expect(runtime`insert into app.app_user (email, full_name)
      values ('QA.ONE@demo', 'Дублікат')`).rejects.toMatchObject({
      code: '23514',
    });
    await expect(runtime`insert into app.app_user (email, full_name)
      values ('qa.one@demo', 'Дублікат')`).rejects.toMatchObject({
      code: '23505',
    });
    await expect(runtime`insert into app.app_user (email, full_name)
      values (' qa.spaces@demo ', 'Пробіли')`).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('rejects a changed migration checksum without altering data or history [FND-1]', async () => {
    const data = await snapshot();
    const history =
      await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`;
    const original = history[0];
    expect(original).toBeDefined();
    try {
      await admin`update drizzle.__drizzle_migrations set hash = ${`qa-tampered:${original!.hash}`}
        where id = ${original!.id}`;
      const tampered =
        await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`;
      await expect(migrateDatabase(urls.migration)).rejects.toThrow(
        'Applied migration checksum does not match this checkout',
      );
      expect(await snapshot()).toEqual(data);
      expect(
        await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`,
      ).toEqual(tampered);
    } finally {
      await admin`update drizzle.__drizzle_migrations set hash = ${original!.hash} where id = ${original!.id}`;
    }
    expect(
      await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`,
    ).toEqual(history);
  });

  it('rejects migration history ahead of the checkout without partial writes [FND-1]', async () => {
    const data = await snapshot();
    const history =
      await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`;
    const [fixture] =
      await admin`insert into drizzle.__drizzle_migrations (hash, created_at)
      select 'qa-ahead-history', max(created_at) + 1 from drizzle.__drizzle_migrations returning id`;
    try {
      const ahead =
        await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`;
      await expect(migrateDatabase(urls.migration)).rejects.toThrow(
        'Database migration history is ahead of this checkout',
      );
      expect(await snapshot()).toEqual(data);
      expect(
        await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`,
      ).toEqual(ahead);
    } finally {
      await admin`delete from drizzle.__drizzle_migrations where id = ${fixture!.id}`;
    }
    expect(
      await admin`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`,
    ).toEqual(history);
  });

  it('migrates with a non-superuser and restricts managed session access to the three-column bridge [FND-1, DG-05, DG-22]', async () => {
    testDatabaseUrls();
    const suffix = randomUUID().replaceAll('-', '');
    const loginName = `qa_migrator_${suffix}`;
    const databaseName = `recruiting_test_role_${suffix}`;
    const password = randomUUID();
    const target = new URL(urls.migration);
    target.username = loginName;
    target.password = password;
    target.pathname = `/${databaseName}`;
    const temporary = connectTestDatabase(target.toString());
    const ownerTarget = new URL(urls.migration);
    ownerTarget.pathname = `/${databaseName}`;
    const owner = connectTestDatabase(ownerTarget.toString());
    const runtimeTarget = new URL(urls.runtime);
    runtimeTarget.pathname = `/${databaseName}`;
    const temporaryRuntime = connectTestDatabase(runtimeTarget.toString());
    let loginCreated = false;
    let databaseCreated = false;
    try {
      await admin.begin(async (tx) => {
        await tx`create role ${tx(loginName)} nologin nosuperuser nocreatedb createrole noreplication nobypassrls`;
        await tx`select set_config('qa.migration_login', ${loginName}, true),
          set_config('qa.migration_password', ${password}, true)`;
        await tx`do $$ begin execute format('alter role %I login password %L',
          current_setting('qa.migration_login'), current_setting('qa.migration_password')); end $$`;
        await tx`grant app_migrator to ${tx(loginName)} with admin true, inherit false, set false`;
      });
      loginCreated = true;
      await admin`create database ${admin(databaseName)} owner ${admin(loginName)}`;
      databaseCreated = true;
      await owner`create schema auth`;
      await owner`revoke all on schema auth from public`;
      await owner`create table auth.sessions (
        id uuid primary key, user_id uuid not null, not_after timestamptz,
        refresh_token_hmac_key text, ip inet
      )`;
      await owner`grant usage on schema auth to ${owner(loginName)}`;
      await owner`grant select on auth.sessions to ${owner(loginName)} with grant option`;
      const [authOwner] = await owner`select n.nspowner::regrole::text as owner,
        has_schema_privilege('app_rw', 'auth', 'USAGE') as runtime_usage
        from pg_namespace n where n.nspname = 'auth'`;
      expect(authOwner).toEqual({
        owner: 'recruiting_test',
        runtime_usage: false,
      });
      const [role] =
        await temporary`select rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user`;
      expect(role).toEqual({
        rolsuper: false,
        rolcreaterole: true,
        rolbypassrls: false,
      });
      const [before] =
        await admin`select m.admin_option, m.inherit_option, m.set_option
        from pg_auth_members m join pg_roles member on member.oid = m.member
        join pg_roles granted on granted.oid = m.roleid
        where member.rolname = ${loginName} and granted.rolname = 'app_migrator'`;
      expect(before).toEqual({
        admin_option: true,
        inherit_option: false,
        set_option: false,
      });
      await expect(
        temporary`create schema app authorization app_migrator`,
      ).rejects.toMatchObject({ code: '42501' });
      await migrateDatabase(target.toString());
      const tables =
        await temporary`select tablename, tableowner from pg_tables where schemaname = 'app' order by tablename`;
      expect(tables.map((table) => table.tablename)).toEqual(phaseOneTables);
      expect(tables.every((table) => table.tableowner === 'app_migrator')).toBe(
        true,
      );
      const switched = await admin`select m.set_option from pg_auth_members m
        join pg_roles member on member.oid = m.member join pg_roles granted on granted.oid = m.roleid
        where member.rolname = ${loginName} and granted.rolname = 'app_migrator'`;
      expect(switched.some((membership) => membership.set_option)).toBe(true);
      const [runtimeMembership] = await admin`select
        pg_has_role('app_rw', 'app_migrator', 'MEMBER') as migrator,
        pg_has_role('app_rw', 'app_purge', 'MEMBER') as purge`;
      expect(runtimeMembership).toEqual({ migrator: false, purge: false });

      const [bridge] = await owner`select viewowner from pg_views
        where schemaname = 'app' and viewname = 'auth_session_status'`;
      expect(bridge?.viewowner).toBe(loginName);
      const [options] = await owner`select reloptions from pg_class
        where oid = 'app.auth_session_status'::regclass`;
      expect(options?.reloptions).toContain('security_barrier=true');
      expect(options?.reloptions ?? []).not.toContain('security_invoker=true');
      const columns =
        await owner`select column_name from information_schema.columns
        where table_schema = 'app' and table_name = 'auth_session_status' order by ordinal_position`;
      expect(columns.map((column) => column.column_name)).toEqual([
        'id',
        'user_id',
        'not_after',
      ]);
      const [direct] =
        await owner`select has_schema_privilege('app_rw', 'auth', 'USAGE') as usage,
        has_table_privilege('app_rw', 'auth.sessions', 'SELECT') as table_select,
        has_any_column_privilege('app_rw', 'auth.sessions', 'SELECT') as column_select`;
      expect(direct).toEqual({
        usage: false,
        table_select: false,
        column_select: false,
      });
      const forbiddenGrants =
        await owner`select acl.privilege_type from pg_class c
        cross join lateral aclexplode(c.relacl) acl left join pg_roles r on r.oid = acl.grantee
        where c.oid = 'app.auth_session_status'::regclass
        and (acl.grantee = 0 or r.rolname in ('anon','authenticated','service_role'))`;
      expect(forbiddenGrants).toHaveLength(0);
      const sessionId = '10000000-0000-4000-8000-000000000001';
      const sessionUserId = '10000000-0000-4000-8000-000000000002';
      await owner`insert into auth.sessions (id, user_id, refresh_token_hmac_key, ip)
        values (${sessionId}, ${sessionUserId}, 'synthetic-sensitive-permission-fixture', '192.0.2.10')`;
      const visible =
        await temporaryRuntime`select * from app.auth_session_status
        where id = ${sessionId} and user_id = ${sessionUserId} and (not_after is null or not_after > now())`;
      expect(visible).toEqual([
        { id: sessionId, user_id: sessionUserId, not_after: null },
      ]);
      await expect(
        temporaryRuntime`select id, user_id, not_after from auth.sessions`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        temporaryRuntime`select refresh_token_hmac_key, ip from auth.sessions`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        temporaryRuntime`update app.auth_session_status set not_after = null`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        temporaryRuntime`delete from app.auth_session_status`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        temporaryRuntime`insert into app.auth_session_status (id, user_id) values (${randomUUID()}, ${sessionUserId})`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        temporaryRuntime`create view app.forbidden_session_view as select 1`,
      ).rejects.toMatchObject({ code: '42501' });
      await owner`update auth.sessions set not_after = '2000-01-01T00:00:00Z' where id = ${sessionId}`;
      expect(
        await temporaryRuntime`select id from app.auth_session_status where id = ${sessionId}
        and (not_after is null or not_after > now())`,
      ).toHaveLength(0);
      await owner`delete from auth.sessions where id = ${sessionId}`;
      expect(
        await temporaryRuntime`select id from app.auth_session_status where id = ${sessionId}`,
      ).toHaveLength(0);
    } finally {
      await Promise.all([temporary.end(), owner.end(), temporaryRuntime.end()]);
      if (databaseCreated) await admin`drop database ${admin(databaseName)}`;
      if (loginCreated) await admin`drop role ${admin(loginName)}`;
    }
  });

  it.each(['ADMIN', 'FINANCE'])(
    'requires global scope and unique assignments for %s [ROLE-01]',
    async (role) => {
      await runtime`insert into app.user_role (user_id, role) values (${userId}, ${role})`;
      await expect(runtime`insert into app.user_role (user_id, role)
      values (${userId}, ${role})`).rejects.toMatchObject({ code: '23505' });
      await expect(runtime`insert into app.user_role (user_id, role, vertical_id)
      values (${anotherUserId}, ${role}, ${verticalId})`).rejects.toMatchObject(
        { code: '23514' },
      );
    },
  );

  it.each(['HEAD_RECRUITER', 'RECRUITER', 'HEAD_HR', 'HR', 'TEAM_LEAD'])(
    'requires vertical scope and permits separate verticals for %s [ROLE-01]',
    async (role) => {
      await expect(runtime`insert into app.user_role (user_id, role)
        values (${userId}, ${role})`).rejects.toMatchObject({ code: '23514' });
      await runtime`insert into app.user_role (user_id, role, vertical_id) values
        (${userId}, ${role}, ${verticalId}), (${userId}, ${role}, ${otherVerticalId})`;
      await expect(runtime`insert into app.user_role (user_id, role, vertical_id)
        values (${userId}, ${role}, ${verticalId})`).rejects.toMatchObject({
        code: '23505',
      });
    },
  );

  it('rejects unknown role codes and preserves additive custom role codes [ROLE-04]', async () => {
    await expect(runtime`insert into app.user_role (user_id, role, vertical_id)
      values (${userId}, 'UNKNOWN', ${verticalId})`).rejects.toMatchObject({
      code: '23514',
    });
    await runtime`insert into app.user_role (user_id, role, vertical_id)
      values (${userId}, 'custom:qa_reader', ${verticalId})`;
  });

  it('allows zero and tied priorities but rejects negative priorities [ROUTE-01]', async () => {
    await runtime`insert into app.team_lead_priority (vertical_id, user_id, priority) values
      (${verticalId}, ${userId}, 0), (${verticalId}, ${anotherUserId}, 0)`;
    await expect(runtime`update app.team_lead_priority set priority = -1
      where vertical_id = ${verticalId} and user_id = ${userId}`).rejects.toMatchObject(
      { code: '23514' },
    );
  });

  it('enforces invite hashing, 72-hour expiry and a single pending invite [ROLE-05]', async () => {
    await runtime`insert into app.user_invite
      (user_id, token_hash, roles, sent_at, expires_at, invited_by)
      values (${userId}, ${Buffer.alloc(32, 1)}, '[{"role":"ADMIN","verticalId":null}]',
        '2099-01-01T00:00:00Z', '2099-01-04T00:00:00Z', ${anotherUserId})`;
    await expect(runtime`insert into app.user_invite
      (user_id, token_hash, roles, sent_at, expires_at, invited_by)
      values (${userId}, ${Buffer.alloc(32, 2)}, '[{"role":"ADMIN","verticalId":null}]',
        '2099-01-01T00:00:00Z', '2099-01-04T00:00:00Z', ${anotherUserId})`).rejects.toMatchObject(
      { code: '23505' },
    );
    await expect(runtime`update app.user_invite set token_hash = ${Buffer.alloc(31)}
      where user_id = ${userId}`).rejects.toMatchObject({ code: '23514' });
    await expect(runtime`update app.user_invite set expires_at = sent_at + interval '73 hours'
      where user_id = ${userId}`).rejects.toMatchObject({ code: '23514' });
    await expect(runtime`update app.user_invite set status = 'ACCEPTED'
      where user_id = ${userId}`).rejects.toMatchObject({ code: '23514' });
    await expect(runtime`update app.user_invite set roles = '[]'
      where user_id = ${userId}`).rejects.toMatchObject({ code: '23514' });
  });

  it('starts editable rows at version 1 and rejects invalid versions', async () => {
    const [initial] =
      await runtime`select version from app.vertical where id = ${verticalId}`;
    expect(initial?.version).toBe(1);
    const first =
      await runtime`update app.vertical set name = 'Перевірка QA оновлена', version = version + 1
      where id = ${verticalId} and version = 1 returning version`;
    expect(first).toMatchObject([{ version: 2 }]);
    const stale =
      await runtime`update app.vertical set name = 'Застаріла зміна', version = version + 1
      where id = ${verticalId} and version = 1 returning version`;
    expect(stale).toHaveLength(0);
    for (const table of [
      'vertical',
      'app_user',
      'user_invite',
      'team_lead_priority',
      'app_setting',
      'saved_filter',
      'file_object',
    ]) {
      const columns =
        await admin`select column_default, is_nullable from information_schema.columns
        where table_schema = 'app' and table_name = ${table} and column_name = 'version'`;
      expect(columns, table).toMatchObject([
        { column_default: '1', is_nullable: 'NO' },
      ]);
      const checks =
        await admin`select pg_get_constraintdef(c.oid) as definition from pg_constraint c
        join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'app' and t.relname = ${table} and c.contype = 'c'`;
      expect(
        checks.some((row) => /version.*(?:> 0|>= 1)/.test(row.definition)),
        table,
      ).toBe(true);
    }
    await expect(
      runtime`update app.vertical set version = 0 where id = ${verticalId}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces dotted names, versioned object payloads and actor consistency [HIST-01, AUD]', async () => {
    for (const type of ['USER_INVITED', 'user.invited.extra']) {
      await expect(runtime`insert into app.entity_event
        (occurred_at, actor_kind, type, subject_type, subject_id, payload)
        values (now(), 'SYSTEM', ${type}, 'app_user', ${userId}, '{"v":1}')`).rejects.toMatchObject(
        { code: '23514' },
      );
    }
    for (const payload of [{}, [], { v: '1' }]) {
      await expect(runtime`insert into app.entity_event
        (occurred_at, actor_kind, type, subject_type, subject_id, payload)
        values (now(), 'SYSTEM', 'user.invited', 'app_user', ${userId}, ${runtime.json(payload)})`).rejects.toMatchObject(
        { code: '23514' },
      );
    }
    await expect(runtime`insert into app.entity_event
      (occurred_at, actor_kind, type, subject_type, subject_id, payload)
      values (now(), 'USER', 'user.invited', 'app_user', ${userId}, '{"v":1}')`).rejects.toMatchObject(
      { code: '23514' },
    );
    await expect(runtime`insert into app.audit_log (occurred_at, actor_kind, action)
      values (now(), 'SYSTEM', 'USER_INVITED')`).rejects.toMatchObject({
      code: '23514',
    });
  });

  it.each(['entity_event', 'audit_log'] as const)(
    'blocks runtime and owner tampering with %s [HIST-03, AUD]',
    async (table) => {
      if (table === 'entity_event') {
        await runtime`insert into app.entity_event
        (occurred_at, actor_kind, type, subject_type, subject_id, payload)
        values (now(), 'SYSTEM', 'user.invited', 'app_user', ${userId}, '{"v":1}')`;
      } else {
        await runtime`insert into app.audit_log (occurred_at, actor_kind, action)
        values (now(), 'SYSTEM', 'user.invited')`;
      }
      for (const statement of [
        `update app.${table} set occurred_at = occurred_at`,
        `delete from app.${table}`,
        `truncate app.${table} cascade`,
      ]) {
        await expect(runtime.unsafe(statement)).rejects.toMatchObject({
          code: '42501',
        });
        await expect(admin.unsafe(statement)).rejects.toMatchObject({
          code: 'P0001',
        });
      }
    },
  );

  it('blocks runtime modification of purgeable event PII [HIST-03]', async () => {
    const [event] = await runtime`select id from app.entity_event limit 1`;
    await runtime`insert into app.entity_event_pii (event_id, data) values (${event!.id}, '{"fullName":"Перевірка"}')`;
    await expect(
      runtime`update app.entity_event_pii set data = '{}'`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      runtime`delete from app.entity_event_pii`,
    ).rejects.toMatchObject({ code: '42501' });
    await expect(runtime`truncate app.entity_event_pii`).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('limits app_purge to deleting event PII and clearing audit diffs [HIST-03, DG-17]', async () => {
    const [event] = await runtime`insert into app.entity_event
      (occurred_at, actor_kind, type, subject_type, subject_id, payload)
      values (now(), 'SYSTEM', 'user.profile_updated', 'app_user', ${userId}, '{"v":1}') returning id`;
    await runtime`insert into app.entity_event_pii (event_id, data)
      values (${event!.id}, '{"fullName":"Персональні дані"}')`;
    const [audit] = await runtime`insert into app.audit_log
      (occurred_at, actor_kind, action, before, after)
      values (now(), 'SYSTEM', 'user.profile_updated', '{"name":"До"}', '{"name":"Після"}') returning id`;

    for (const table of phaseOneTables) {
      const [grant] =
        await admin`select has_table_privilege('app_purge', ${`app.${table}`}, 'DELETE') as allowed`;
      expect(grant?.allowed, table).toBe(table === 'entity_event_pii');
    }
    await admin.begin(async (tx) => {
      await tx`set local role app_purge`;
      const pii =
        await tx`select data from app.entity_event_pii where event_id = ${event!.id}`;
      expect(pii).toEqual([{ data: { fullName: 'Персональні дані' } }]);
      const removed =
        await tx`delete from app.entity_event_pii where event_id = ${event!.id} returning event_id`;
      expect(removed).toHaveLength(1);
      const cleared =
        await tx`update app.audit_log set before = null, after = null
        where id = ${audit!.id} returning before, after`;
      expect(cleared).toEqual([{ before: null, after: null }]);

      for (const statement of [
        'update app.audit_log set action = action',
        'update app.audit_log set actor_id = actor_id',
        'delete from app.audit_log',
        'update app.entity_event set payload = payload',
        'delete from app.entity_event',
        'update app.entity_event_pii set data = data',
        'truncate app.audit_log',
        'truncate app.entity_event cascade',
        'truncate app.entity_event_pii',
      ]) {
        await expect(
          tx.savepoint((query) => query.unsafe(statement)),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        tx.savepoint(
          (query) => query`update app.audit_log set before = '{"restored":true}'
        where id = ${audit!.id}`,
        ),
      ).rejects.toMatchObject({ code: 'P0001' });
    });
    const [remaining] =
      await admin`select count(*)::int as count from app.entity_event_pii where event_id = ${event!.id}`;
    expect(remaining?.count).toBe(0);
    const [cleared] =
      await admin`select before, after from app.audit_log where id = ${audit!.id}`;
    expect(cleared).toEqual({ before: null, after: null });
  });

  it('denies PUBLIC, anon and authenticated access and enables RLS on every table [VIS-01]', async () => {
    const tables =
      await admin`select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relkind = 'r'`;
    expect(tables).toHaveLength(phaseOneTables.length);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    const policies = await admin`select policyname from pg_policies
      where schemaname = 'app' and roles && array['public', 'anon', 'authenticated']::name[]`;
    expect(policies).toHaveLength(0);
    for (const role of ['anon', 'authenticated']) {
      const [schema] =
        await admin`select has_schema_privilege(${role}, 'app', 'USAGE') as allowed`;
      expect(schema?.allowed, role).toBe(false);
      for (const table of phaseOneTables) {
        const [grants] =
          await admin`select has_table_privilege(${role}, ${`app.${table}`}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed`;
        expect(grants?.allowed, `${role}:${table}`).toBe(false);
      }
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx`select * from app.app_user`;
        }),
      ).rejects.toMatchObject({ code: '42501' });
    }
    const publicGrants =
      await admin`select grantee from information_schema.table_privileges
      where table_schema = 'app' and grantee = 'PUBLIC'`;
    expect(publicGrants).toHaveLength(0);
  });

  it('seeds Ukrainian Phase 1 fixtures idempotently without Auth or future domain rows [STORY-SEED-1]', async () => {
    const source = {
      APP_ENV: 'local',
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
      DATABASE_URL: urls.runtime,
      DATABASE_MIGRATION_URL: urls.migration,
    };
    await seedDemo(source);
    const before = await snapshot();
    await seedDemo(source);
    expect(await snapshot()).toEqual(before);
    const verticals =
      await runtime`select name from app.vertical where name in ('Гемблінг', 'Крипто') order by name`;
    expect(verticals.map((row) => row.name)).toEqual(['Гемблінг', 'Крипто']);
    const emails = [
      'admin@demo',
      'head.recruiter.gambling@demo',
      'recruiter1.gambling@demo',
      'recruiter2.gambling@demo',
      'recruiter.crypto@demo',
      'head.hr@demo',
      'hr@demo',
      'vasyl.tl@demo',
      'taras.tl@demo',
      'tl.crypto@demo',
      'finance@demo',
    ];
    const users =
      await runtime`select email, full_name, auth_user_id, activated_at from app.app_user where email in ${runtime(emails)}`;
    expect(users).toHaveLength(emails.length);
    expect(users.every((row) => /[А-Яа-яІіЇїЄєҐґ]/.test(row.full_name))).toBe(
      true,
    );
    expect(
      users.every(
        (row) => row.auth_user_id === null && row.activated_at === null,
      ),
    ).toBe(true);
    const hrRoles =
      await runtime`select u.email, count(*)::int as count from app.user_role r
      join app.app_user u on r.user_id = u.id where u.email in ('head.hr@demo', 'hr@demo') group by u.email order by u.email`;
    expect(hrRoles).toEqual([
      { email: 'head.hr@demo', count: 2 },
      { email: 'hr@demo', count: 2 },
    ]);
    const priorities =
      await runtime`select u.email, p.priority from app.team_lead_priority p
      join app.app_user u on u.id = p.user_id where u.email in ('vasyl.tl@demo', 'taras.tl@demo', 'tl.crypto@demo') order by u.email`;
    expect(priorities).toEqual([
      { email: 'taras.tl@demo', priority: 1 },
      { email: 'tl.crypto@demo', priority: 0 },
      { email: 'vasyl.tl@demo', priority: 0 },
    ]);
    const [inactive] =
      await runtime`select count(*)::int as count from app.app_user where not is_active and deactivated_at is not null`;
    expect(inactive?.count).toBe(1);
    const [expired] =
      await runtime`select count(*)::int as count from app.user_invite
      where status = 'PENDING' and expires_at < now() and expires_at = sent_at + interval '72 hours' and octet_length(token_hash) = 32`;
    expect(expired?.count).toBe(1);
    const [auth] =
      await admin`select to_regclass('auth.users') as users, to_regclass('auth.mfa_factors') as mfa`;
    expect(auth).toEqual({ users: null, mfa: null });
  });

  it.each([
    { APP_ENV: 'production' },
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://app_rw:unused@192.0.2.1/recruiting_test' },
    {
      DATABASE_MIGRATION_URL:
        'postgresql://recruiting_test:unused@192.0.2.1/recruiting_test',
    },
  ])(
    'refuses an unsafe seed target before writing [STORY-SEED-1]: %j',
    async (override) => {
      const before = await snapshot();
      await expect(
        seedDemo({
          APP_ENV: 'local',
          APP_URL: 'http://localhost:3000',
          NODE_ENV: 'test',
          DATABASE_URL: urls.runtime,
          DATABASE_MIGRATION_URL: urls.migration,
          ...override,
        }),
      ).rejects.toThrow(/local|loopback|production/i);
      expect(await snapshot()).toEqual(before);
    },
  );
});
