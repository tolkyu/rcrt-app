import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../lib/env';
import {
  localStatusUrl,
  localStatusValue,
  readLocalSupabaseStatus,
} from './local-supabase';

const { migrationUrl, runtimeUrl } = parseLocalDatabaseTargets(process.env);
const status = readLocalSupabaseStatus();
const origin = localStatusUrl(status, 'API_URL').origin;
const database = localStatusUrl(status, 'DB_URL');
const expected = new URL(migrationUrl);
if (
  origin !== process.env.SUPABASE_URL ||
  database.host !== expected.host ||
  database.pathname !== expected.pathname
)
  throw new Error(
    'Storage check must use the same local Supabase stack as the app',
  );
const sql = postgres(migrationUrl, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});
const runtime = postgres(runtimeUrl, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});
const client = createClient(origin, localStatusValue(status, 'SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  },
});
const bucket = `dg03-${randomUUID()}`;
let created = false;
try {
  await assertDisposableLocalData(sql);
  const [baseline] = await sql<
    { rls: boolean; policies: number; publicBuckets: number }[]
  >`
    select c.relrowsecurity as rls,
      (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects') as policies,
      (select count(*)::int from storage.buckets where public) as "publicBuckets"
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'`;
  if (!baseline?.rls || baseline.policies !== 0 || baseline.publicBuckets !== 0)
    throw new Error(
      'DG-03 requires RLS, zero object policies and private buckets',
    );
  await runtime`select count(*) from app.auth_mfa_totp`;
  const createdBucket = await client.storage.createBucket(bucket, {
    public: false,
  });
  if (createdBucket.error)
    throw new Error('Cannot create isolated DG-03 fixture');
  created = true;
  const uploaded = await client.storage
    .from(bucket)
    .upload('marker.txt', new TextEncoder().encode('private DG-03 marker'), {
      contentType: 'text/plain',
    });
  if (uploaded.error) throw new Error('Cannot upload isolated DG-03 fixture');
  const serviceRead = await client.storage.from(bucket).download('marker.txt');
  if (serviceRead.error || !serviceRead.data)
    throw new Error('DG-03 service fixture is unreadable');
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(randomUUID())
    .setAudience('authenticated')
    .setIssuer(`${origin}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(new TextEncoder().encode(localStatusValue(status, 'JWT_SECRET')));
  const anonymous = localStatusValue(status, 'ANON_KEY');
  for (const credential of [anonymous, token]) {
    const headers = {
      apikey: localStatusValue(status, 'PUBLISHABLE_KEY'),
      authorization: `Bearer ${credential}`,
    };
    const listing = await fetch(`${origin}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 10 }),
      signal: AbortSignal.timeout(10_000),
    });
    const result: unknown = await listing.json();
    if (!listing.ok || !Array.isArray(result) || result.length !== 0)
      throw new Error(
        'DG-03: direct client list must succeed with no visible objects',
      );
    const download = await fetch(
      `${origin}/storage/v1/object/${bucket}/marker.txt`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (download.status !== 400 && download.status !== 404)
      throw new Error(
        'DG-03: direct client download must hide the private object',
      );
  }
  console.info(
    'DG-03 passed: anonymous/user JWT cannot list or download; runtime MFA view is readable.',
  );
} finally {
  if (created) {
    const removed = await client.storage.from(bucket).remove(['marker.txt']);
    const deleted = await client.storage.deleteBucket(bucket);
    if (removed.error || deleted.error) process.exitCode = 1;
  }
  await Promise.all([sql.end(), runtime.end()]);
}
