import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  MAX_CONTEXT_BYTES,
  reconstructPageContext,
  SafePageContexts,
} from '../support/safe-page-context';
import { contextCopy } from '../security/privacy-fixture';
import messages from '../../messages/uk.json' with { type: 'json' };
import type { TestResult, TestStep } from '@playwright/test/reporter';
import { privateResult, privateStep } from '../support/report-privacy';

const prefix =
  '# Instructions\n\n- Following Playwright test failed.\n- Explain why, be concise, respect Playwright best practices.\n- Provide a snippet of code with the fix, if possible.\n\n# Test info\n\n- Name: opaque-private-name\n- Location: opaque-private-location:1:1';
const envelope = (tree: string, kind: 'matcher' | 'page' = 'matcher') =>
  prefix +
  (kind === 'matcher'
    ? '\n\n# Error details\n\n```\nopaque-private-error\n```\n\n```yaml\n'
    : '\n\n# Page snapshot\n\n```yaml\n') +
  tree +
  '\n```';
const knownTree = `- main:\n  - article "${contextCopy.card}":\n    - heading "${contextCopy.card}" [level=2]\n  - alert:\n    - paragraph: ${contextCopy.toast}`;
const cache = resolve('.cache/safe-context-units');
mkdirSync(cache, { recursive: true });
const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(cache, 'case-'));
  directories.push(directory);
  const root = join(directory, 'output');
  mkdirSync(root);
  const path = join(root, 'error-context.md');
  writeFileSync(path, envelope(knownTree));
  const result = {
    status: 'failed' as const,
    errors: [{ message: 'failure' }],
    attachments: [
      { name: 'error-context', contentType: 'text/markdown', path },
    ],
  };
  return {
    directory,
    root,
    path,
    result,
    policy: new SafePageContexts([root]),
  };
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (dirname(resolve(directory)) !== cache)
      throw new Error('Unexpected fixture cleanup path');
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('reconstructed structural error context [SEC, CI-LOG-01]', () => {
  it.each(['matcher', 'page'] as const)(
    'retains validated copy and hierarchy from the genuine %s envelope',
    (kind) => {
      const result = reconstructPageContext(envelope(knownTree, kind));
      expect(result).toContain(contextCopy.card);
      expect(result).toContain(
        kind === 'matcher' ? 'Matcher subtree' : 'Page snapshot',
      );
      expect(result).toContain(contextCopy.toast);
      expect(result).toContain('  - alert:');
      expect(result).not.toContain('opaque-private');
      expect(
        reconstructPageContext(
          envelope(knownTree, kind).replaceAll('\n', '\r\n'),
        ),
      ).toBe(result);
    },
  );
  it('recognizes the saved real matcher alert shape without requiring a Page snapshot', () => {
    expect(
      reconstructPageContext(
        envelope(`- alert:\n  - paragraph: ${contextCopy.toast}`),
      ),
    ).toContain(contextCopy.toast);
  });
  it('keeps fixed states but strips arbitrary names/text, inputs, URLs, placeholders and references', () => {
    const tree = `- main [ref=e1]:\n  - paragraph: MarinaZoriaUnlabelled418\n  - button "OpaqueButtonName" [disabled] [ref=e2] [cursor=pointer]\n  - textbox "${contextCopy.card}": ${contextCopy.toast}\n  - link "${contextCopy.card}":\n    - /url: https://fixture.invalid/OpaqueURL\n    - /placeholder: OpaquePlaceholder\n  - text: ${contextCopy.card} OpaqueSuffix`;
    const result = reconstructPageContext(envelope(tree));
    expect(result).toContain('[disabled]');
    expect(result).toContain(contextCopy.card);
    for (const value of [
      'MarinaZoria',
      'Opaque',
      'https:',
      'ref=',
      'cursor=',
      contextCopy.toast,
    ])
      expect(result).not.toContain(value);
  });
  it('never treats ICU templates or their dynamic expansions as static copy', () => {
    for (const text of [
      messages.profile.nameTooLong,
      messages.profile.nameTooLong.replace('{max}', '73920'),
    ])
      expect(
        reconstructPageContext(
          envelope(`- paragraph: ${JSON.stringify(text)}`),
        ),
      ).not.toContain(text);
  });
  it('also strips input values represented as children when a placeholder is present', () => {
    const tree = `- textbox "${contextCopy.card}":\n  - /placeholder: OpaquePlaceholder\n  - text: ${contextCopy.toast}`;
    const result = reconstructPageContext(envelope(tree));
    expect(result).toContain(contextCopy.card);
    expect(result).not.toContain(contextCopy.toast);
    expect(result).not.toContain('OpaquePlaceholder');
  });
  it.each([
    '- unknownrole: hidden',
    '- button [private=hidden]',
    ' - paragraph: hidden',
    '- paragraph: |\n  hidden',
    '- main:\n    - paragraph: hidden',
    '- /url: hidden',
    '- main:\n  - /unknown: hidden',
    '- link:\n  - /url: "unclosed',
    '- heading [level=73920]',
    '- button "unclosed',
    Array.from({ length: 18 }, (_, i) => `${'  '.repeat(i)}- generic:`).join(
      '\n',
    ),
    Array.from({ length: 513 }, () => '- generic').join('\n'),
  ])('rejects unsupported/malformed/over-budget snapshot #%#', (tree) => {
    expect(reconstructPageContext(envelope(tree))).toBeUndefined();
  });
  it('rejects spoofed, oversized, partial and duplicate producer sections', () => {
    for (const source of [
      knownTree,
      envelope(knownTree).replace('opaque-private-name', 'opaque\rprivate'),
      envelope(knownTree).slice(0, -4),
      envelope(knownTree) + '\n```yaml\n- alert',
      envelope(knownTree) +
        '\n\n# Page snapshot\n\n```yaml\n- alert\n```\n\n# Page snapshot\n\n```yaml\n- alert\n```',
      'x'.repeat(MAX_CONTEXT_BYTES + 1),
    ])
      expect(reconstructPageContext(source)).toBeUndefined();
  });
  it('emits only a newly constructed body and caches immutable safe text without re-reading raw files', () => {
    const { path, policy, result } = fixture();
    const first = policy.forResult(result);
    expect(first[0]?.name).toBe('sanitized-page-context');
    expect(first[0]?.path).toBeUndefined();
    expect(first[0]?.body?.toString()).toContain(contextCopy.toast);
    first[0]?.body?.fill(120);
    unlinkSync(path);
    result.attachments = [
      { name: 'error-context', path, contentType: 'text/markdown' },
    ];
    expect(policy.forResult(result)[0]?.body?.toString()).toContain(
      contextCopy.toast,
    );
  });
  it('does not resurrect raw or spoofed safe attachments after a rejected first capture', () => {
    const { policy, result } = fixture();
    const original = result.attachments;
    result.attachments = [{ ...original[0]!, name: 'sanitized-page-context' }];
    expect(policy.forResult(result)).toEqual([]);
    result.attachments = original;
    expect(policy.forResult(result)).toEqual([]);
  });
  it('keeps result/step re-sanitization idempotent and never resurrects late unsafe attachments', () => {
    const { policy, path, result: raw } = fixture();
    const forged = {
      name: 'sanitized-page-context',
      contentType: 'text/plain',
      body: Buffer.from('OpaquePrivateBody'),
    };
    const step: TestStep = {
      title: 'safe step',
      titlePath: () => ['safe step'],
      category: 'test.step',
      startTime: new Date(0),
      duration: 1,
      steps: [],
      annotations: [],
      attachments: [forged],
    };
    const result: TestResult = {
      ...raw,
      workerIndex: 0,
      parallelIndex: 0,
      retry: 0,
      startTime: new Date(0),
      duration: 1,
      annotations: [],
      stdout: [],
      stderr: [],
      steps: [step],
    };
    privateResult(result, policy);
    const expected = result.attachments[0]?.body?.toString();
    expect(expected).toContain(contextCopy.toast);
    expect(step.attachments).toEqual([]);
    unlinkSync(path);
    step.attachments.push(forged);
    privateStep(step);
    expect(step.attachments).toEqual([]);
    result.attachments = [forged];
    step.attachments.push(forged);
    privateResult(result, policy);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.body?.toString()).toBe(expected);
    expect(step.attachments).toEqual([]);
  });
  it('rejects wrong names/types, duplicate candidates, body payloads, and non-producer paths', () => {
    const { root, path } = fixture();
    const good = { name: 'error-context', contentType: 'text/markdown', path };
    for (const attachments of [
      [{ ...good, name: 'trace' }],
      [{ ...good, path: 'error-context.md' }],
      [{ ...good, path: `${root}${sep}..${sep}output${sep}error-context.md` }],
      [{ ...good, contentType: 'text/plain' }],
      [good, { ...good, path: join(root, 'other', 'error-context.md') }],
      [good, { ...good, body: Buffer.from(envelope(knownTree)) }],
      [good, good, good],
      [{ ...good, body: Buffer.from(envelope(knownTree)) }],
      [{ ...good, path: join(root, 'copied-error-context-123.md') }],
    ]) {
      expect(
        new SafePageContexts([root]).forResult({
          status: 'failed',
          errors: [{}],
          attachments,
        }),
      ).toEqual([]);
    }
  });
  it('deduplicates the pinned runtime repeated reference to the identical producer file', () => {
    const { policy, result } = fixture();
    const attachment = result.attachments[0];
    if (!attachment) throw new Error('Missing test attachment');
    result.attachments.push({ ...attachment });
    expect(policy.forResult(result)).toHaveLength(1);
  });
  it('rejects escaped, linked, hardlinked, oversized, malformed and invalid UTF-8 files', () => {
    const { directory, root, path } = fixture();
    const outside = join(directory, 'outside');
    mkdirSync(outside);
    const outsideFile = join(outside, 'error-context.md');
    writeFileSync(outsideFile, envelope(knownTree));
    const junction = join(root, 'junction');
    symlinkSync(outside, junction, 'junction');
    const linkedRoot = join(directory, 'linked-root');
    symlinkSync(root, linkedRoot, 'junction');
    const read = (candidate: string, roots = [root]) =>
      new SafePageContexts(roots).forResult({
        status: 'failed',
        errors: [{}],
        attachments: [
          {
            name: 'error-context',
            contentType: 'text/markdown',
            path: candidate,
          },
        ],
      });
    expect(read(outsideFile)).toEqual([]);
    expect(read(join(junction, 'error-context.md'))).toEqual([]);
    expect(read(join(linkedRoot, 'error-context.md'), [linkedRoot])).toEqual(
      [],
    );
    const directoryPath = join(root, 'directory', 'error-context.md');
    mkdirSync(directoryPath, { recursive: true });
    expect(read(directoryPath)).toEqual([]);
    linkSync(path, join(root, 'hardlink.md'));
    expect(read(path)).toEqual([]);
    unlinkSync(join(root, 'hardlink.md'));
    for (const data of [
      'x'.repeat(MAX_CONTEXT_BYTES + 1),
      'not a producer context',
      Buffer.from([0xff, 0xfe]),
    ]) {
      writeFileSync(path, data);
      expect(read(path)).toEqual([]);
    }
  });
});
