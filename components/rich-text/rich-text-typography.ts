/** One definition for the editor and the read view, so a document looks the same on both (UX review, Decision 2). */
export const RICH_TEXT_TYPOGRAPHY =
  'text-foreground space-y-3 text-base leading-6 [overflow-wrap:anywhere] [&_p]:min-h-6 [&_p]:whitespace-pre-wrap [&_h1]:text-heading-lg [&_h1]:whitespace-pre-wrap [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:whitespace-pre-wrap [&_h3]:text-base [&_h3]:font-semibold [&_h3]:whitespace-pre-wrap [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_li]:space-y-2 [&_a]:text-link [&_a]:underline [&_a]:underline-offset-4';

/** Shared by the loading, failure and loaded editor slots so the field never changes height. */
export const RICH_TEXT_FIELD_HEIGHT = 'min-h-74 md:min-h-94';
