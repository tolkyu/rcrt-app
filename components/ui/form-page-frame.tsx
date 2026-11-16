import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

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
      <Link
        href={back.href}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm md:min-h-9"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
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

/** Sticks above the BottomNav on a phone; on a phone the children share the row and the last one wraps to full width. */
export function FormPageFooter({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="form-page-footer"
      className="border-border bg-surface after:bg-surface sticky bottom-(--chrome-bottom) z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t px-4 py-3 after:absolute after:inset-x-0 after:top-full after:h-[env(safe-area-inset-bottom)] md:bottom-0 md:mx-0 md:rounded-b-xl md:px-0 md:after:hidden [&>*]:flex-1 md:[&>*]:flex-none"
    >
      {children}
    </div>
  );
}
