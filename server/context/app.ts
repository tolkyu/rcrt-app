import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getDb } from '../db';
import { systemClock } from '../domain/clock';
import {
  resolveRequestContext,
  type ContextDependencies,
} from './request-context';

export const appContextDependencies: ContextDependencies = {
  db: getDb,
  clock: systemClock,
};

/** RSC entry point: one context query per render, shared by every component of the request. */
export const getRequestContext = cache(async () =>
  resolveRequestContext(appContextDependencies, new Headers(await headers())),
);
