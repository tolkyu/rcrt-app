import type { ReactNode } from 'react';

export function GallerySection({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-heading-lg">
          {title}
        </h2>
        {hint && (
          <p className="text-muted-foreground max-w-prose text-sm">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function GalleryGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && (
          <p className="text-muted-foreground max-w-prose text-xs">{hint}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
