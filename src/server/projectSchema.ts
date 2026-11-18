import { z } from "zod";

/** Request-side validation of the project the client sends with a note. */
export const ProjectSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        trade: z.string().max(60),
        aliases: z.array(z.string().max(60)).max(30),
        durationDays: z.number().positive().max(365),
        dependsOn: z.array(z.object({ taskId: z.string().max(64), lagDays: z.number().min(0).max(365) })).max(30),
        delayDays: z.number().min(0).max(365),
      }),
    )
    .min(1)
    .max(200),
});

export const ParseRequestSchema = z.object({
  transcript: z.string().max(20_000),
  project: ProjectSchema,
});
