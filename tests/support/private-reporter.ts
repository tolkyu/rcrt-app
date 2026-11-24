import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { z } from 'zod';
import { SafePageContexts } from './safe-page-context';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import {
  OMITTED_OUTPUT,
  privateError,
  privateResult,
  privateReportConfig,
  privateStep,
  privateSuite,
} from './report-privacy';

type PinnedReporter = Omit<Reporter, 'onBegin'> & {
  onConfigure(config: FullConfig): void;
  onBegin(suite: Suite): void;
};
type Constructor = new (options: {
  configDir: string;
  outputFolder?: string;
  open?: string;
  noSnippets?: boolean;
}) => PinnedReporter;
const constructor = z.custom<Constructor>(
  (value) => typeof value === 'function',
);

/** The exported runner bundle is internal: upgrades must rerun the decoded-report canary before changing this pin. */
function pinnedReporters() {
  const require = createRequire(import.meta.url);
  const dependencyRequire = createRequire(
    require.resolve('@playwright/test/package.json'),
  );
  if (
    z
      .object({ version: z.string() })
      .parse(dependencyRequire('playwright/package.json')).version !== '1.64.1'
  )
    throw new Error('CI-LOG-01 reporter requires Playwright 1.64.1');
  return z
    .object({
      ListReporter: constructor,
      html: z.object({ default: constructor }),
    })
    .parse(dependencyRequire('playwright/lib/runner'));
}

export default class PrivateReporter implements Reporter {
  private builtins = pinnedReporters();
  private sinks: PinnedReporter[] = [];
  private suite?: Suite;
  private contexts?: SafePageContexts;
  private outputSeen = new WeakSet<TestResult>();
  private globalOutputSeen = false;

  constructor(private options: { outputFolder?: string } = {}) {}

  printsToStdio() {
    return true;
  }

  onBegin(config: FullConfig, suite: Suite) {
    const { ListReporter, html } = this.builtins;
    const configDir = config.configFile
      ? dirname(config.configFile)
      : process.cwd();
    this.sinks = [
      new ListReporter({ configDir }),
      new html.default({
        configDir,
        outputFolder: this.options.outputFolder,
        open: 'never',
        noSnippets: true,
      }),
    ];
    this.suite = suite;
    this.contexts = new SafePageContexts(
      config.projects.map((project) => project.outputDir),
    );
    privateSuite(suite, this.contexts);
    const reportConfig = privateReportConfig(config);
    for (const sink of this.sinks) {
      sink.onConfigure(reportConfig);
      sink.onBegin(suite);
    }
  }

  onTestBegin(test: TestCase, result: TestResult) {
    this.sinks.forEach((sink) => sink.onTestBegin?.(test, result));
  }

  onStepBegin(test: TestCase, result: TestResult, step: TestStep) {
    privateStep(step);
    this.sinks.forEach((sink) => sink.onStepBegin?.(test, result, step));
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    privateStep(step);
    this.sinks.forEach((sink) => sink.onStepEnd?.(test, result, step));
  }

  onTestEnd(test: TestCase, result: TestResult) {
    privateResult(result, this.contexts);
    this.sinks.forEach((sink) => sink.onTestEnd?.(test, result));
  }

  onError(error: TestError) {
    this.sinks.forEach((sink) => sink.onError?.(privateError(error)));
  }

  onStdOut(
    _chunk: string | Buffer,
    test: void | TestCase,
    result: void | TestResult,
  ) {
    this.omitOutput(test, result);
  }
  onStdErr(
    _chunk: string | Buffer,
    test: void | TestCase,
    result: void | TestResult,
  ) {
    this.omitOutput(test, result);
  }

  private omitOutput(test: void | TestCase, result: void | TestResult) {
    if (result ? this.outputSeen.has(result) : this.globalOutputSeen) return;
    if (result) this.outputSeen.add(result);
    else this.globalOutputSeen = true;
    this.sinks.forEach((sink) =>
      sink.onStdOut?.(`${OMITTED_OUTPUT}\n`, test, result),
    );
  }

  async onEnd(result: FullResult) {
    if (this.suite) privateSuite(this.suite, this.contexts);
    for (const sink of this.sinks) await sink.onEnd?.(result);
  }

  async onExit() {
    for (const sink of this.sinks) await sink.onExit?.();
  }
}
