export const ALL_VERTICALS = 'all';

export interface VerticalOption {
  readonly id: string;
  readonly name: string;
}

/** Header vertical filter (screens.md §1): a stored id counts only if it is still one of the user's verticals. */
export function resolveVerticalFilter(
  stored: string | null | undefined,
  verticals: readonly VerticalOption[],
): string {
  return (
    verticals.find((vertical) => vertical.id === stored)?.id ?? ALL_VERTICALS
  );
}
