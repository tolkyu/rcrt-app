import type { ReactNode } from 'react';

/** A titled block of fields (the loading twin is the `'group'` row of `FormSkeleton`). */
export function FormGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6">
      <h2
        id={id}
        className="text-foreground border-border border-b pb-2 text-base font-semibold"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
