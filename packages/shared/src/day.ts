import { z } from 'zod';

/** Pojedynczy cel na wejściu (wpis poranny). */
export const goalInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).optional(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

/** Wpis poranny: dokładnie 1 cel główny + 2 poboczne (+ opcjonalna notatka poranna). */
export const morningEntrySchema = z.object({
  main: goalInputSchema,
  secondary: z.array(goalInputSchema).length(2),
  morningNote: z.string().trim().max(2000).optional(),
});
export type MorningEntry = z.infer<typeof morningEntrySchema>;

export const goalKindSchema = z.enum(['main', 'secondary']);
export const dayStatusSchema = z.enum(['evening_pending', 'closed']);

/** Cel w odpowiedzi (stan dnia). `completed = null` dopóki nieoznaczony wieczorem. */
export const goalSchema = z.object({
  id: z.string(),
  kind: goalKindSchema,
  position: z.number().int(),
  title: z.string(),
  note: z.string().nullable(),
  completed: z.boolean().nullable(),
  completedNote: z.string().nullable(),
});
export type Goal = z.infer<typeof goalSchema>;

/** Dzień z celami (odpowiedź API). `date` jako `YYYY-MM-DD`. */
export const daySchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: dayStatusSchema,
  morningNote: z.string().nullable(),
  eveningNote: z.string().nullable(),
  goals: z.array(goalSchema),
});
export type Day = z.infer<typeof daySchema>;
