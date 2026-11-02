'use client';

import { useIsMutating } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { userCardMutationKey } from '@/lib/queries/user-detail';
import type { UserDetail } from '@/lib/schemas/user';

const loadDialog = () => import('./user-activation-dialog');
const UserActivationDialog = dynamic(() =>
  loadDialog().then((module) => module.UserActivationDialog),
);
const preload = () => {
  loadDialog().catch(() => undefined);
};

export function UserActivationActions({
  detail,
  isSelf,
  onFocusHeading,
}: {
  detail: UserDetail;
  isSelf: boolean;
  onFocusHeading: () => void;
}) {
  const t = useTranslations('settings.users.drawer.activation');
  const reasonId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [action, setAction] = useState<'deactivate' | 'reactivate' | null>(
    null,
  );
  const busy =
    useIsMutating({ mutationKey: userCardMutationKey(detail.id) }) > 0;
  // Only accepted users have a lifecycle; invitees use the invitation actions (wireframe §1.3).
  if (
    !detail.activatedAt ||
    (detail.status !== 'ACTIVE' && detail.status !== 'DEACTIVATED')
  )
    return null;
  const reactivate = detail.status === 'DEACTIVATED';
  const reason = reactivate
    ? null
    : isSelf
      ? t('selfReason')
      : detail.lastActiveAdmin
        ? t('lastAdminReason')
        : null;
  return (
    <div
      role="group"
      aria-label={t('actionsLabel')}
      className="border-border bg-surface sticky bottom-0 -mx-6 mt-auto -mb-6 flex flex-col gap-2 border-t px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <Button
        ref={trigger}
        className="aria-disabled:bg-surface-muted aria-disabled:text-muted-foreground h-12 aria-disabled:cursor-not-allowed sm:h-10 sm:self-start"
        variant={reactivate ? 'default' : 'destructive-soft'}
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? reasonId : undefined}
        disabled={busy}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          if (!reason) setAction(reactivate ? 'reactivate' : 'deactivate');
        }}
      >
        {reactivate ? t('reactivate') : t('deactivate')}
      </Button>
      {reason && (
        <p id={reasonId} className="text-muted-foreground text-xs">
          {reason}
        </p>
      )}
      {action && (
        <UserActivationDialog
          detail={detail}
          reactivate={action === 'reactivate'}
          onClose={() => setAction(null)}
          onFocusHeading={onFocusHeading}
          onFocusTrigger={() => trigger.current?.focus()}
        />
      )}
    </div>
  );
}
