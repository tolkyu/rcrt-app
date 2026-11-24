import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** The page back link of forms and the card: muted text with a chevron, 44 px tall on touch (same box as `FormPageHeading`). */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'text-muted-foreground hover:text-foreground -ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm md:min-h-9',
        className,
      )}
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
