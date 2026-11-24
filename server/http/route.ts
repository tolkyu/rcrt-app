import 'server-only';
import { appContextDependencies } from '../context/app';
import { describeError, logger } from '../observability/logger';
import { createRouteFactory } from './define-route';
import { apiRegistry } from './openapi';

export const defineRoute = createRouteFactory({
  ...appContextDependencies,
  appUrl: () => process.env.APP_URL ?? '',
  registry: apiRegistry,
  onComplete: ({ error, ...entry }) => {
    if (error === undefined) logger.info(entry, 'api request');
    else
      logger.error(
        { ...entry, err: describeError(error) },
        'api request failed',
      );
  },
});
