import { z } from 'zod';

/** 0 is the highest priority; ties are allowed and broken by the oldest vacancy at routing time (D5). */
export const TEAM_LEAD_PRIORITY_MAX = 99;
export const TEAM_LEAD_PRIORITY_CHANGES_MAX = 200;

export const teamLeadPriorityValueSchema = z
  .number()
  .int()
  .min(0)
  .max(TEAM_LEAD_PRIORITY_MAX);

export const teamLeadPriorityChangeSchema = z
  .object({
    userId: z.uuid().toLowerCase(),
    priority: teamLeadPriorityValueSchema.nullable().meta({
      description: 'New priority; null clears it («Пріоритет не задано», D47).',
    }),
    version: z.number().int().positive().nullable().meta({
      description:
        'Version of the stored priority row the edit started from; null when the Team Lead had no priority.',
    }),
  })
  .strict();

export const updateTeamLeadPrioritiesSchema = z
  .object({
    changes: z
      .array(teamLeadPriorityChangeSchema)
      .min(1)
      .max(TEAM_LEAD_PRIORITY_CHANGES_MAX)
      .refine(
        (changes) =>
          new Set(changes.map((change) => change.userId)).size ===
          changes.length,
        { message: 'duplicate_user' },
      ),
  })
  .strict()
  .meta({ id: 'UpdateTeamLeadPriorities' });
export type UpdateTeamLeadPrioritiesInput = z.input<
  typeof updateTeamLeadPrioritiesSchema
>;

export const teamLeadPriorityItemSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  priority: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive().nullable().meta({
    description:
      'Send back as `version` with a change; null = no priority row yet.',
  }),
});
export type TeamLeadPriorityItem = z.infer<typeof teamLeadPriorityItemSchema>;

/** «Пріоритети тімлідів» for one vertical: active Team Leads only; invitees are only counted (wireframe P1.1 #3). */
export const verticalTeamLeadPrioritiesSchema = z
  .object({
    vertical: z.object({ id: z.uuid(), name: z.string() }),
    items: z.array(teamLeadPriorityItemSchema),
    pendingInvites: z.number().int().nonnegative().meta({
      description:
        'Team Leads in this vertical who have not accepted their invite yet.',
    }),
  })
  .meta({ id: 'VerticalTeamLeadPriorities' });
export type VerticalTeamLeadPriorities = z.infer<
  typeof verticalTeamLeadPrioritiesSchema
>;

/** Malformed ids answer 404 like unknown ones (VIS-02), so the path takes any short string. */
export const teamLeadPriorityParamsSchema = z.object({
  verticalId: z.string().max(64).meta({ description: 'Vertical id (uuid).' }),
});

export const teamLeadPriorityVerticalsSchema = z
  .object({ items: z.array(z.object({ id: z.uuid(), name: z.string() })) })
  .meta({ id: 'TeamLeadPriorityVerticals' });
export type TeamLeadPriorityVerticals = z.infer<
  typeof teamLeadPriorityVerticalsSchema
>;
