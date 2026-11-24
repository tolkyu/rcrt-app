import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { expect } from '@playwright/test';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { requireLoopbackUrl } from './loopback';
import { withOwner } from './vacancy-request-db';

export interface IsolatedActor {
  id: string;
  email: string;
  authId: string;
}
export interface ActorRole {
  role: 'ADMIN' | 'FINANCE' | 'RECRUITER';
  verticalId: string | null;
}

export function localAuthAdmin() {
  const env = {
    ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}),
    ...process.env,
  };
  const url = requireLoopbackUrl('SUPABASE_URL', env.SUPABASE_URL);
  if (!env.SUPABASE_SECRET_KEY)
    throw new Error(
      'Isolated MFA actors require the local Supabase secret key',
    );
  return createClient(url, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}

/** Runs `run` with a disposable local user, so role removal or logout never touches a shared seeded session. */
export async function withIsolatedActor(
  roles: readonly ActorRole[],
  run: (actor: IsolatedActor) => Promise<void>,
) {
  const admin = localAuthAdmin();
  const id = randomUUID();
  const email = `e2e-denial-${id}@fixture.test`;
  const created = await admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user)
    throw new Error('Could not create the isolated local actor');
  const authId = created.data.user.id;
  try {
    await withOwner((sql) =>
      sql.begin(async (tx) => {
        await tx`
          insert into app.app_user (id, auth_user_id, email, full_name, activated_at)
          values (${id}, ${authId}, ${email}, 'E2E Denial', ${FIXED_CLOCK_ISO})`;
        for (const { role, verticalId } of roles)
          await tx`
            insert into app.user_role (user_id, role, vertical_id)
            values (${id}, ${role}, ${verticalId})`;
      }),
    );
    await run({ id, email, authId });
  } finally {
    try {
      await withOwner((sql) =>
        sql.begin(async (tx) => {
          await tx`delete from app.user_role where user_id = ${id}`;
          await tx`
            update app.user_session set ended_at = now(), end_reason = 'USER'
            where user_id = ${id} and ended_at is null`;
          // Append-only audit references retain the inactive fixture identity.
          await tx`
            update app.app_user set is_active = false, deactivated_at = now(), auth_user_id = null
            where id = ${id} and email = ${email}`;
        }),
      );
    } finally {
      const removed = await admin.deleteUser(authId);
      expect(removed.error).toBeNull();
    }
  }
}
