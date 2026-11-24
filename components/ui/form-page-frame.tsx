import type { ReactNode, RefCallback } from 'react';
import { BackLink } from './back-link';

/** Back link, title and subtitle; shared by `FormPageLayout` and `FormSkeleton` so the loading page has the same box. */
export function FormPageHeading({
  titleId,
  title,
  subtitle,
  back,
}: {
  titleId?: string;
  title: string;
  subtitle?: string;
  back: { href: string; label: string };
}) {
  return (
    <>
      <BackLink href={back.href} label={back.label} />
      <div className="mt-2 mb-6">
        <h1
          id={titleId}
          className="text-heading-lg text-foreground md:text-display-xl [overflow-wrap:anywhere]"
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">
            {subtitle}
          </p>
        )}
      </div>
    </>
  );
}

/** Sticks above the BottomNav on a phone, where the children share the row and the last one wraps to full width; its bottom margin cancels the part of the shell's 7rem padding the nav does not cover. `stickyRef` publishes its height so toasts stack above it. */
export function FormPageFooter({
  children,
  stickyRef,
}: {
  children: ReactNode;
  stickyRef?: RefCallback<HTMLElement>;
}) {
  return (
    <div
      ref={stickyRef}
      data-slot="form-page-footer"
      className="border-border bg-surface after:bg-surface sticky bottom-(--chrome-bottom) z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t px-4 py-3 after:absolute after:inset-x-0 after:top-full after:h-[env(safe-area-inset-bottom)] md:bottom-0 md:mx-0 md:px-4 md:after:hidden [&>*]:flex-1 md:[&>*]:flex-none max-md:[:root:has([data-bottom-nav])_&]:mb-[calc(var(--chrome-bottom)-7rem)]"
    >
      {children}
    </div>
  );
}
