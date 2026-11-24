import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { basename, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import type { TestResult } from '@playwright/test/reporter';
import messages from '../../messages/uk.json' with { type: 'json' };

export const SAFE_CONTEXT_NAME = 'sanitized-page-context';
export const MAX_CONTEXT_BYTES = 256 * 1024;
const MAX_NODES = 512;
const MAX_DEPTH = 16;
const OMITTED = '[omitted]';
const roles = new Set([
  'alert',
  'alertdialog',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'emphasis',
  'form',
  'generic',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'main',
  'navigation',
  'option',
  'paragraph',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'text',
  'textbox',
  'time',
  'tooltip',
]);
const inputs = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
  'slider',
]);
const states = new Set([
  'checked',
  'checked=mixed',
  'disabled',
  'expanded',
  'active',
  'invalid',
  'invalid=grammar',
  'invalid=spelling',
  'pressed',
  'pressed=mixed',
  'selected',
  'aria-hidden',
]);
const publicCopy = new Map<string, string>();
function collectCopy(value: unknown) {
  if (typeof value === 'string') {
    if (
      value.length <= 512 &&
      /\p{Script=Cyrillic}/u.test(value) &&
      !/[{}<>@]|\p{Cc}|[a-z][a-z0-9+.-]*:\/\//iu.test(value)
    )
      publicCopy.set(value, value);
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.values(value).forEach(collectCopy);
  }
}
collectCopy(messages);

function scalar(text: string) {
  if (text.startsWith('"')) {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'string') throw new Error('Unsupported scalar');
    return parsed;
  }
  if (
    [
      '&',
      '*',
      '!',
      '|',
      '>',
      '[',
      '{',
      "'",
      '`',
      '#',
      ']',
      ',',
      '?',
      '@',
      '%',
    ].some((prefix) => text.startsWith(prefix)) ||
    /[\r\n]/.test(text)
  )
    throw new Error('Unsupported scalar');
  return text;
}

function snapshotTree(snapshot: string) {
  const lines = snapshot.split('\n');
  if (
    !lines.length ||
    lines.length > MAX_NODES ||
    Buffer.byteLength(snapshot) > 64 * 1024
  )
    return;
  const parents: boolean[] = [];
  const inputParents: boolean[] = [];
  const output: string[] = [];
  for (const line of lines) {
    if (line.length > 4096) return;
    const entry = /^( *)- (.+)$/.exec(line);
    if (!entry || entry[1] === undefined || !entry[2]) return;
    const indentation = entry[1] ?? '';
    const depth = indentation.length / 2;
    if (
      !Number.isInteger(depth) ||
      depth > MAX_DEPTH ||
      (depth > 0 && !parents[depth - 1])
    )
      return;
    let node = entry[2] ?? '';
    if (/^\/(url|placeholder): .+$/.test(node)) {
      if (depth === 0) return;
      scalar(node.slice(node.indexOf(': ') + 2));
      continue;
    }
    if (node.startsWith("'")) {
      const quoted = /^'((?:[^']|'')*)'(.*)$/.exec(node);
      if (!quoted?.[1] || !/^(?::(?: .*)?)?$/.test(quoted[2] ?? '')) return;
      node = quoted[1].replaceAll("''", "'") + (quoted[2] ?? '');
    }
    const parsed =
      /^([a-z]+)(?: ("(?:[^"\\]|\\.)*"))?((?: \[[^\]\r\n]+\])*)(?:(:)(?: (.*))?)?$/.exec(
        node,
      );
    const role = parsed?.[1];
    if (!parsed || !role || !roles.has(role)) return;
    const safeStates: string[] = [];
    for (const attribute of (parsed[3] ?? '').matchAll(/ \[([^\]]+)\]/g)) {
      const state = attribute[1] ?? '';
      if (states.has(state) || /^level=[1-6]$/.test(state))
        safeStates.push(state);
      else if (!/^ref=e\d{1,8}$/.test(state) && state !== 'cursor=pointer')
        return;
    }
    const insideInput = depth > 0 && inputParents[depth - 1] === true;
    const name =
      parsed[2] === undefined
        ? ''
        : ` ${JSON.stringify(insideInput ? OMITTED : (publicCopy.get(scalar(parsed[2])) ?? OMITTED))}`;
    const value = parsed[5];
    const text =
      value === undefined
        ? ''
        : `: ${JSON.stringify(inputs.has(role) || insideInput ? OMITTED : (publicCopy.get(scalar(value)) ?? OMITTED))}`;
    const container = parsed[4] === ':' && value === undefined;
    parents.length = depth + 1;
    parents[depth] = container;
    inputParents.length = depth + 1;
    inputParents[depth] = insideInput || inputs.has(role);
    output.push(
      `${'  '.repeat(depth)}- ${role}${name}${safeStates.map((state) => ` [${state}]`).join('')}${text}${container ? ':' : ''}`,
    );
  }
  return output.length ? output.join('\n') : undefined;
}

/** Parse only the pinned producer envelope; no instructions, errors, source, or raw YAML are copied. */
export function reconstructPageContext(source: string): string | undefined {
  if (Buffer.byteLength(source) > MAX_CONTEXT_BYTES) return;
  const text = source.replaceAll('\r\n', '\n');
  if (text.includes('\r')) return;
  const header =
    /^# Instructions\n\n- Following Playwright test failed\.\n- Explain why, be concise, respect Playwright best practices\.\n- Provide a snippet of code with the fix, if possible\.\n\n# Test info\n\n- Name: [^\n]{1,2048}\n- Location: [^\n]{1,2048}(?=\n|$)/.exec(
      text,
    );
  if (!header) return;
  const lines = text.slice(header[0].length).split('\n');
  if (lines.length > 5000) return;
  let index = 0;
  const snapshots: {
    kind: 'Matcher subtree' | 'Page snapshot';
    tree: string;
  }[] = [];
  const sections = new Set<string>();
  const blank = () => {
    while (lines[index] === '') index++;
  };
  const fence = (opening: string) => {
    if (lines[index++] !== opening) throw new Error('Unknown fence');
    const start = index;
    while (index < lines.length && lines[index] !== '```') index++;
    if (index === lines.length) throw new Error('Unclosed fence');
    return lines.slice(start, index++).join('\n');
  };
  const add = (snapshot: string, kind: 'Matcher subtree' | 'Page snapshot') => {
    if (snapshots.length >= 4) throw new Error('Too many snapshots');
    const tree = snapshotTree(snapshot);
    if (!tree) throw new Error('Unsupported snapshot');
    snapshots.push({ kind, tree });
  };
  try {
    blank();
    while (index < lines.length) {
      const section = lines[index++] ?? '';
      if (sections.has(section)) return;
      sections.add(section);
      blank();
      if (section === '# Error details') {
        let errors = 0;
        while (lines[index] === '```') {
          if (++errors > 8) return;
          fence('```');
          blank();
          if (lines[index] === '```yaml') {
            add(fence('```yaml'), 'Matcher subtree');
            blank();
          }
        }
        if (!errors) return;
      } else if (section === '# Page snapshot') {
        add(fence('```yaml'), 'Page snapshot');
      } else if (section === '# Test source') {
        fence('```ts');
        blank();
        if (index !== lines.length) return;
      } else return;
      blank();
      if (sections.has('# Test source') && index < lines.length) return;
    }
  } catch {
    return;
  }
  if (!snapshots.length) return;
  const result =
    '# Sanitized structural context\n\n' +
    snapshots
      .map(({ kind, tree }, index) => `## ${kind} ${index + 1}\n\n${tree}`)
      .join('\n\n');
  return Buffer.byteLength(result) <= 64 * 1024 ? result : undefined;
}

function noLinks(path: string) {
  let current = parse(path).root;
  for (const part of relative(current, path).split(sep)) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return false;
  }
  return true;
}

function samePath(left: string, right: string) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function readProducerContext(path: string, roots: readonly string[]) {
  if (
    path.length > 4096 ||
    !isAbsolute(path) ||
    !samePath(path, resolve(path)) ||
    basename(path) !== 'error-context.md'
  )
    return;
  if (
    !roots.some((root) => {
      const child = relative(root, path);
      return (
        child !== '' &&
        child !== '..' &&
        !child.startsWith(`..${sep}`) &&
        !isAbsolute(child)
      );
    })
  )
    return;
  let fd: number | undefined;
  try {
    if (!noLinks(path) || !samePath(realpathSync(path), resolve(path))) return;
    const before = lstatSync(path);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > MAX_CONTEXT_BYTES
    )
      return;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size !== before.size ||
      !noLinks(path)
    )
      return;
    const bytes = Buffer.alloc(MAX_CONTEXT_BYTES + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    if (
      count > MAX_CONTEXT_BYTES ||
      count !== opened.size ||
      fstatSync(fd).size !== count ||
      !samePath(realpathSync(path), resolve(path))
    )
      return;
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, count),
    );
  } catch {
    return;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

type ContextResult = Pick<TestResult, 'attachments' | 'status' | 'errors'>;
export class SafePageContexts {
  private cache = new WeakMap<ContextResult, string | undefined>();
  private roots: string[];
  constructor(roots: readonly string[]) {
    this.roots = roots.map((root) => resolve(root));
  }
  forResult(result: ContextResult): TestResult['attachments'] {
    if (!this.cache.has(result)) {
      this.cache.set(result, undefined);
      const candidates = result.attachments.filter(
        (item) => item.name === 'error-context',
      );
      const first = candidates[0];
      // The pinned runtime emits the same producer file twice; distinct or inconsistent candidates fail closed.
      const attachment =
        candidates.length <= 2 &&
        first &&
        candidates.every(
          (item) =>
            item.path === first.path &&
            item.contentType === 'text/markdown' &&
            item.body === undefined,
        )
          ? first
          : undefined;
      if (
        (result.status === 'failed' || result.status === 'timedOut') &&
        result.errors.length &&
        attachment?.contentType === 'text/markdown' &&
        attachment.body === undefined &&
        attachment.path
      ) {
        const raw = readProducerContext(attachment.path, this.roots);
        if (raw !== undefined)
          this.cache.set(result, reconstructPageContext(raw));
      }
    }
    const context = this.cache.get(result);
    return context === undefined
      ? []
      : [
          {
            name: SAFE_CONTEXT_NAME,
            contentType: 'text/plain',
            body: Buffer.from(context),
          },
        ];
  }
}
