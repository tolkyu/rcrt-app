import type {
  FullConfig,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { networkCode } from './safe-network-error';
import type { SafePageContexts } from './safe-page-context';

const PRIVATE_DIAGNOSTIC =
  /cookie|authorization|(?:access|refresh)[_-]?token|token[_-]?hash|password|secret|api[_-]?key|Bearer\s|Call log:|apiRequestContext\.|[?&](?:token|code)=/i;
export const OMITTED_OUTPUT =
  '[worker output omitted by credential privacy policy]';

export function privateReportConfig(config: FullConfig): FullConfig {
  const workers = config.metadata.actualWorkers;
  return {
    ...config,
    metadata: {
      diagnosticPolicy: 'CI-LOG-01',
      ...(typeof workers === 'number' &&
      Number.isSafeInteger(workers) &&
      workers > 0 &&
      workers <= config.workers
        ? { actualWorkers: workers }
        : {}),
    },
    projects: config.projects.map((project) => ({
      ...project,
      metadata: { diagnosticPolicy: 'CI-LOG-01' },
    })),
  };
}

export function privateDiagnostic(text: string) {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    /* Diagnostics need not be valid URLs. */
  }
  return PRIVATE_DIAGNOSTIC.test(decoded)
    ? `[credential-bearing diagnostic omitted; ${networkCode(decoded)}]`
    : text;
}

export function privateError(error: TestError, depth = 0): TestError {
  return {
    message:
      error.message === undefined
        ? undefined
        : privateDiagnostic(error.message),
    stack:
      error.stack === undefined ? undefined : privateDiagnostic(error.stack),
    value:
      error.value === undefined ? undefined : privateDiagnostic(error.value),
    location: error.location,
    // Source snippets can contain credential literals, even when the error text is safe.
    cause:
      error.cause && depth < 8
        ? privateError(error.cause, depth + 1)
        : undefined,
  };
}

function privateAnnotations(annotations: TestCase['annotations']) {
  for (const annotation of annotations) {
    annotation.type = privateDiagnostic(annotation.type);
    if (annotation.description)
      annotation.description = privateDiagnostic(annotation.description);
  }
}

export function privateStep(step: TestStep) {
  step.title = privateDiagnostic(step.title);
  if (step.subtitle) step.subtitle = privateDiagnostic(step.subtitle);
  step.params = undefined;
  step.attachments = [];
  privateAnnotations(step.annotations);
  if (step.error) step.error = privateError(step.error);
  step.steps.forEach(privateStep);
}

export function privateResult(result: TestResult, contexts?: SafePageContexts) {
  const attachments = contexts?.forResult(result) ?? [];
  result.errors = result.errors.map((error) => privateError(error));
  if (result.error) result.error = privateError(result.error);
  result.steps.forEach(privateStep);
  privateAnnotations(result.annotations);
  result.attachments = attachments;
  result.stdout = result.stdout.length ? [OMITTED_OUTPUT] : [];
  result.stderr = result.stderr.length ? [OMITTED_OUTPUT] : [];
}

export function privateSuite(suite: Suite, contexts?: SafePageContexts) {
  suite.title = privateDiagnostic(suite.title);
  for (const test of suite.tests) {
    test.title = privateDiagnostic(test.title);
    // Playwright 1.64.1 exposes tags through a getter without a setter.
    Object.defineProperty(test, 'tags', {
      value: test.tags.map(privateDiagnostic),
      configurable: true,
    });
    privateAnnotations(test.annotations);
    test.results.forEach((result) => privateResult(result, contexts));
  }
  suite.suites.forEach((child) => privateSuite(child, contexts));
}
