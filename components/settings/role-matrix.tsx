'use client';

import { Check, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, type Ref } from 'react';
import { useRoleLabel } from '@/components/auth/use-role-label';
import { Button } from '@/components/ui/button';
import { roleAssignmentKey } from '@/lib/role-diff';
import { GLOBAL_ROLE_CODES, ROLE_DISPLAY_ORDER } from '@/lib/roles';
import { cn } from '@/lib/utils';

/** D40: only these are global; every other built-in role needs a vertical. */
export const isGlobalRole = (role: string) =>
  (GLOBAL_ROLE_CODES as readonly string[]).includes(role);
const VERTICAL_ROLES = ROLE_DISPLAY_ORDER.filter((role) => !isGlobalRole(role));

export const roleKey = (role: string, verticalId: string | null) =>
  roleAssignmentKey({ role, verticalId });

export function parseRoleKey(key: string) {
  const [role = '', verticalId = ''] = key.split('|');
  return { role, verticalId: verticalId || null };
}

function MatrixCell({
  checked,
  label,
  lockedReasonId,
  onChange,
}: {
  checked: boolean;
  label: string;
  lockedReasonId?: string;
  onChange: (checked: boolean) => void;
}) {
  const locked = lockedReasonId !== undefined;
  return (
    <label
      className={cn(
        'relative mx-auto flex size-11 items-center justify-center md:size-9',
        locked ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        // aria-disabled keeps the cell focusable so its reason is read (wireframe §7, DisabledReason).
        aria-disabled={locked || undefined}
        aria-describedby={lockedReasonId}
        onClick={(event) => {
          if (locked) event.preventDefault();
        }}
        onChange={(event) => {
          if (!locked) onChange(event.target.checked);
        }}
        className={cn(
          'peer absolute inset-0 z-10 opacity-0',
          locked ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'peer-focus-visible:ring-ring flex size-8 items-center justify-center rounded-lg border transition-colors duration-120 peer-focus-visible:ring-2',
          checked
            ? 'border-success bg-success/15 text-success-text'
            : 'border-border bg-surface text-muted-foreground hover:bg-surface-muted',
          locked && 'opacity-60',
        )}
      >
        {checked && <Check className="size-4" strokeWidth={3} />}
      </span>
    </label>
  );
}

/**
 * Roles × verticals (wireframe §1.2/§1.4, D40): vertical roles per column, global roles once, so the UI
 * cannot produce an invalid combination. `locked` maps a role key to the reason it cannot be toggled.
 */
export function RoleMatrix({
  verticals,
  verticalsState,
  onRetryVerticals,
  canManageVerticals,
  selected,
  onToggle,
  invalid,
  locked,
  ref,
}: {
  verticals: readonly { id: string; name: string }[];
  /** «No verticals» is shown only for a loaded empty list, never while loading or after a failed fetch. */
  verticalsState: 'pending' | 'error' | 'success';
  onRetryVerticals: () => void;
  canManageVerticals: boolean;
  selected: ReadonlySet<string>;
  onToggle: (key: string, on: boolean) => void;
  invalid: boolean;
  locked?: ReadonlyMap<string, string>;
  ref?: Ref<HTMLDivElement>;
}) {
  const t = useTranslations('settings.users.roleMatrix');
  const tRoles = useTranslations('common.roles');
  const tCommon = useTranslations('common');
  const roleLabel = useRoleLabel();
  const reasonPrefix = useId();
  const columns = [...verticals].sort((a, b) =>
    a.name.localeCompare(b.name, 'uk'),
  );
  const span = Math.max(columns.length, 1);

  return (
    <div
      ref={ref}
      className={cn(
        'border-border overflow-x-auto rounded-xl border',
        invalid && 'border-error',
      )}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="bg-surface-muted text-muted-foreground text-xs">
            <th
              scope="col"
              className="bg-surface-muted sticky left-0 px-3 py-2 text-left font-medium"
            >
              {t('roleColumn')}
            </th>
            {columns.length === 0 && <td aria-hidden="true" />}
            {columns.map((vertical) => (
              <th
                key={vertical.id}
                scope="col"
                className="min-w-20 px-2 py-2 text-center font-medium [overflow-wrap:anywhere]"
              >
                {vertical.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verticalsState !== 'success' || columns.length === 0 ? (
            <tr>
              <td
                colSpan={span + 1}
                className="text-muted-foreground px-3 py-3 text-sm"
              >
                {verticalsState === 'pending' ? (
                  <span className="skeleton-delayed bg-surface-muted block h-8 w-full animate-pulse rounded-lg" />
                ) : verticalsState === 'error' ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {t('verticalsFailed')}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRetryVerticals}
                    >
                      {tCommon('retry')}
                    </Button>
                  </span>
                ) : (
                  <>
                    {t('noVerticals')}{' '}
                    {canManageVerticals && (
                      <Link
                        href="/settings/verticals"
                        className="text-link font-medium hover:underline"
                      >
                        {t('toVerticals')}
                      </Link>
                    )}
                  </>
                )}
              </td>
            </tr>
          ) : (
            VERTICAL_ROLES.map((role) => (
              <tr key={role} className="border-border border-t">
                <th
                  scope="row"
                  className="bg-surface text-foreground sticky left-0 px-3 py-1 text-left font-medium whitespace-nowrap"
                >
                  {tRoles(role)}
                </th>
                {columns.map((vertical) => {
                  const key = roleKey(role, vertical.id);
                  return (
                    <td key={vertical.id} className="px-2 py-1">
                      <MatrixCell
                        checked={selected.has(key)}
                        label={roleLabel(role, vertical.name)}
                        onChange={(on) => onToggle(key, on)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))
          )}
          <tr className="border-border bg-surface-muted border-t">
            <th
              scope="colgroup"
              colSpan={span + 1}
              className="text-muted-foreground px-3 py-2 text-left text-xs font-medium"
            >
              {t('globalGroup')}
            </th>
          </tr>
          {GLOBAL_ROLE_CODES.map((role) => {
            const key = roleKey(role, null);
            const reason = locked?.get(key);
            const reasonId = `${reasonPrefix}-${role}`;
            return (
              <tr key={role} className="border-border border-t">
                <th
                  scope="row"
                  className="bg-surface text-foreground sticky left-0 px-3 py-1 text-left font-medium whitespace-nowrap"
                >
                  {tRoles(role)}
                </th>
                <td colSpan={span} className="px-2 py-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center">
                      <MatrixCell
                        checked={selected.has(key)}
                        label={roleLabel(role, t('allVerticals'))}
                        lockedReasonId={reason ? reasonId : undefined}
                        onChange={(on) => onToggle(key, on)}
                      />
                      <span className="text-foreground text-sm">
                        {t('allVerticals')}
                      </span>
                    </span>
                    <span
                      className="text-muted-foreground inline-flex items-center gap-1 text-xs"
                      title={t('mfaNoteHint')}
                    >
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      {t('mfaNote')}
                      <span className="sr-only"> {t('mfaNoteHint')}</span>
                    </span>
                  </span>
                  {reason && (
                    <p
                      id={reasonId}
                      className="text-muted-foreground px-1 pb-1 text-xs"
                    >
                      {reason}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
