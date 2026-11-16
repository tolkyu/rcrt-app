import type { ReactNode } from 'react';

/** Width of the field column of a form page. */
export const FORM_COLUMN_WIDTH = 'max-w-[45rem]';

/** Content width: the field column alone, or column and rail when the content area holds 720 + 32 + 320 px (a rail never squeezes the column, so the loading skeleton keeps exact geometry). */
export function FormRailFrame({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className={`${FORM_COLUMN_WIDTH} @min-[67rem]:max-w-[72rem]`}>
        {children}
      </div>
    </div>
  );
}

/** Fields column plus a sticky side rail (hidden below the breakpoint); the footer stays below, full width. */
export function FormRailLayout({
  rail,
  children,
}: {
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-8 @min-[67rem]:grid-cols-[minmax(0,45rem)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      {/* A plain block, not <aside>: a landmark inside the form landmark inside <main> is flagged by axe. */}
      <div className="hidden @min-[67rem]:block">
        <div className="sticky top-20">{rail}</div>
      </div>
    </div>
  );
}
