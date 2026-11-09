import { positionNameKey } from './position-name';
import type { Position } from './schemas/position';
import { ALL_VERTICALS } from './vertical-filter';

export interface PositionVertical {
  readonly id: string;
  readonly name: string;
}

export interface PositionGroup {
  readonly vertical: PositionVertical;
  readonly items: readonly Position[];
  /** Positions of the vertical regardless of the inactive toggle. */
  readonly total: number;
  readonly activeCount: number;
  readonly inactiveCount: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const byName = (left: Position, right: Position) =>
  left.name.localeCompare(right.name, 'uk');

/** `?vertical=<id|all>&inactive=1`; anything else is ignored so a crafted URL cannot reach the filter. */
export function parsePositionsSearch(params: URLSearchParams): {
  readonly vertical: string | undefined;
  readonly inactive: boolean;
} {
  const vertical = params.get('vertical');
  return {
    vertical:
      vertical === ALL_VERTICALS || (vertical && UUID.test(vertical))
        ? vertical.toLowerCase()
        : undefined,
    inactive: params.get('inactive') === '1',
  };
}

export function positionsSearch(state: {
  readonly vertical: string | undefined;
  readonly inactive: boolean;
}): string {
  const params = new URLSearchParams();
  if (state.vertical) params.set('vertical', state.vertical);
  if (state.inactive) params.set('inactive', '1');
  return params.toString();
}

/** URL value, else the header switcher value, each only if the user manages it; otherwise every vertical (wireframe §1.1). */
export function resolvePositionsVertical(
  requested: string | undefined,
  fallback: string,
  managed: readonly PositionVertical[],
): string {
  if (managed.length === 1) return managed[0]!.id;
  const managedIds = new Set(managed.map((vertical) => vertical.id));
  if (requested === ALL_VERTICALS) return ALL_VERTICALS;
  if (requested && managedIds.has(requested)) return requested;
  if (!requested && managedIds.has(fallback)) return fallback;
  return ALL_VERTICALS;
}

/** Create, rename and toggle responses carry no count (null), so the cached one survives; a new position has none yet. */
export function mergePosition(
  items: readonly Position[],
  next: Position,
): Position[] {
  const current = items.find((item) => item.id === next.id);
  const merged: Position = {
    ...next,
    openVacanciesCount:
      next.openVacanciesCount ?? current?.openVacanciesCount ?? 0,
  };
  return [...items.filter((item) => item.id !== next.id), merged].sort(byName);
}

/** The same key the unique index uses, so the client pre-check matches what the server would reject. */
export function findNameConflict(
  items: readonly Position[],
  verticalId: string,
  name: string,
  ignoreId?: string,
): Position | undefined {
  const key = positionNameKey(name);
  return items.find(
    (item) =>
      item.verticalId === verticalId &&
      item.id !== ignoreId &&
      positionNameKey(item.name) === key,
  );
}

/** Managed verticals in the selection, each with its rows; empty verticals stay so they can offer «Додати посаду». */
export function groupPositions(
  items: readonly Position[],
  managed: readonly PositionVertical[],
  vertical: string,
  showInactive: boolean,
): readonly PositionGroup[] {
  return managed
    .filter((entry) => vertical === ALL_VERTICALS || entry.id === vertical)
    .map((entry) => {
      const own = items.filter((item) => item.verticalId === entry.id);
      const activeCount = own.filter((item) => item.isActive).length;
      return {
        vertical: entry,
        total: own.length,
        activeCount,
        inactiveCount: own.length - activeCount,
        items: own.filter((item) => showInactive || item.isActive).sort(byName),
      };
    });
}
