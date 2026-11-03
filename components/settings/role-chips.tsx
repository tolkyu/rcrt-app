'use client';

import { Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import { roleAssignmentKey } from '@/lib/role-diff';
import type { RoleView } from '@/lib/roles';
import { cn } from '@/lib/utils';

type ChipRole = RoleView & { readonly verticalId?: string | null };

const TONES = {
  active: 'bg-primary-subtle text-link',
  muted: 'bg-surface-muted text-muted-foreground',
  removed: 'bg-destructive-subtle text-error-text line-through',
} as const;

/**
 * Role chips of the user card, «Змінити ролі» and the invite summary. `removed` pairs the strike with a
 * minus icon and error colours (≥ 4.5:1), so removal never relies on the line-through alone.
 */
export function RoleChips({
  roles,
  tone = 'active',
  namedGlobal = false,
  marker,
  labelledBy,
}: {
  roles: readonly ChipRole[];
  tone?: keyof typeof TONES;
  /** Dialogs spell out «Усі вертикалі» for global roles; the card shows the bare role name. */
  namedGlobal?: boolean;
  marker?: ReactNode;
  labelledBy?: string;
}) {
  const roleLabel = useRoleLabel();
  const tMatrix = useTranslations('settings.users.roleMatrix');
  return (
    <ul aria-labelledby={labelledBy} className="flex flex-wrap gap-1">
      {roles.map(({ role, vertical, verticalId }) => {
        const id = vertical?.id ?? verticalId ?? null;
        return (
          <li
            key={roleAssignmentKey({ role, verticalId: id })}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere]',
              TONES[tone],
            )}
          >
            {marker ??
              (tone === 'removed' && (
                <Minus className="size-3 shrink-0" aria-hidden="true" />
              ))}
            {roleLabel(
              role,
              vertical?.name ??
                (namedGlobal && !id ? tMatrix('allVerticals') : null),
            )}
          </li>
        );
      })}
    </ul>
  );
}
