/** Radix-free so the native-radio `UrgencyControl` shares the look without pulling Radix RadioGroup into its route (PERF-04). */
export const SEGMENTED_GROUP_CLASS =
  'bg-surface-muted aria-invalid:border-error grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-transparent p-1';

export const SEGMENTED_ITEM_CLASS =
  'text-muted-foreground h-11 rounded-lg border border-transparent px-2 text-sm font-medium md:h-10';

/** Full literals: Tailwind cannot generate a class from a variant string built at run time. */
export const SEGMENTED_CHECKED_RADIX_CLASS =
  'data-[state=checked]:border-border data-[state=checked]:bg-surface data-[state=checked]:text-link dark:data-[state=checked]:bg-primary-subtle data-[state=checked]:shadow-sm disabled:cursor-not-allowed disabled:opacity-60';

export const SEGMENTED_CHECKED_NATIVE_CLASS =
  'has-checked:border-border has-checked:bg-surface has-checked:text-link dark:has-checked:bg-primary-subtle has-checked:shadow-sm group-aria-disabled:cursor-not-allowed group-aria-disabled:opacity-60';
