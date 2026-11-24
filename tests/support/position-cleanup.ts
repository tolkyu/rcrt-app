import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { removeThrowawayPositions } from '../postman/cleanup';

/** Positions have no DELETE route, so a spec removes its own `Тест E2E <run>` rows through the loopback-guarded owner connection. */
export const removeE2EPositions = (namePrefix: string) =>
  removeThrowawayPositions(
    {
      ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}),
      ...process.env,
    },
    namePrefix,
  );
