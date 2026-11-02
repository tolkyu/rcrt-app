import type { TeamLeadPriorityItem } from './schemas/team-lead-priority';

export type PriorityValue = number | null;
type PriorityValues = ReadonlyMap<string, PriorityValue>;
type Item = Pick<TeamLeadPriorityItem, 'userId' | 'fullName' | 'priority'>;

/** Arrows renumber 0..n-1, so at most 100 Team Leads fit in the 0–99 range. */
const ARROW_GROUP_MAX = 100;

/** Field text → priority: empty = not set (D47), digits 0–99; anything else is invalid (`undefined`). */
export function parsePriorityDraft(text: string): PriorityValue | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,2}$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export const priorityText = (value: PriorityValue) =>
  value === null ? '' : String(value);

const valueOf = (values: PriorityValues, item: Item) =>
  values.has(item.userId) ? values.get(item.userId)! : item.priority;

/** D47 order: prioritised ascending (ties by Ukrainian name), then «Без пріоритету» alphabetically. */
export function sortByPriority<T extends Item>(
  items: readonly T[],
  values: PriorityValues,
): T[] {
  return [...items].sort((a, b) => {
    const left = valueOf(values, a);
    const right = valueOf(values, b);
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    }
    return (
      a.fullName.localeCompare(b.fullName, 'uk') ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
    );
  });
}

export type MoveBlock = 'top' | 'lastSet' | 'notSetNoOrder' | 'tooMany';

/** Why `[↑]` / `[↓]` cannot act on this row (DisabledReason), or null when it can. */
export function moveBlocks(
  items: readonly Item[],
  values: PriorityValues,
  userId: string,
): { up: MoveBlock | null; down: MoveBlock | null } {
  const group = sortByPriority(items, values).filter(
    (item) => valueOf(values, item) !== null,
  );
  const index = group.findIndex((item) => item.userId === userId);
  const size = index === -1 ? group.length + 1 : group.length;
  if (size > ARROW_GROUP_MAX) return { up: 'tooMany', down: 'tooMany' };
  return {
    up: index === 0 ? 'top' : null,
    down:
      index === -1
        ? 'notSetNoOrder'
        : index === group.length - 1
          ? 'lastSet'
          : null,
  };
}

/**
 * `[↑]`/`[↓]` (wireframe P1.1 #6): swap within the prioritised group, or append an unprioritised row to its
 * end, then renumber that group 0, 1, 2… — ties only come from typed numbers, arrows never clear a priority.
 */
export function movePriority(
  items: readonly Item[],
  values: PriorityValues,
  userId: string,
  direction: -1 | 1,
): Map<string, PriorityValue> {
  const next = new Map(values);
  const blocks = moveBlocks(items, values, userId);
  if ((direction === -1 ? blocks.up : blocks.down) !== null) return next;
  const group = sortByPriority(items, values).filter(
    (item) => valueOf(values, item) !== null,
  );
  const index = group.findIndex((item) => item.userId === userId);
  if (index === -1) {
    const row = items.find((item) => item.userId === userId);
    if (!row) return next;
    group.push(row);
  } else {
    const target = index + direction;
    [group[index], group[target]] = [group[target]!, group[index]!];
  }
  group.forEach((item, position) => next.set(item.userId, position));
  return next;
}

/** Rows whose draft differs from the stored priority, in display order. */
export function changedRows<T extends Item>(
  items: readonly T[],
  values: PriorityValues,
): T[] {
  return sortByPriority(items, values).filter(
    (item) => valueOf(values, item) !== item.priority,
  );
}

/** Users sharing a priority with someone else get the D5 tie hint. */
export function tiedUsers(items: readonly Item[], values: PriorityValues) {
  const counts = new Map<number, number>();
  for (const item of items) {
    const value = valueOf(values, item);
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Set(
    items
      .filter((item) => {
        const value = valueOf(values, item);
        return value !== null && (counts.get(value) ?? 0) > 1;
      })
      .map((item) => item.userId),
  );
}
