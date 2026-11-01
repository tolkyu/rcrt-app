import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getDb } from '../db';
import { systemClock } from '../domain/clock';
import { verifySupabaseIdentity } from '../auth/supabase-identity';
import {
  resolveRequestContext,
  type ContextDependencies,
} from './request-context';

export const appContextDependencies: ContextDependencies = {
  db: getDb,
  clock: systemClock,
  verifyIdentity: verifySupabaseIdentity,
};

/** RSC entry point: one context query per render, shared by every component of the request. */
export const getRequestContext = cache(async () =>
  resolveRequestContext(appContextDependencies, new Headers(await headers())),
);
