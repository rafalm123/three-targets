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

/** Odpowiedź „pobierz dzień": dzień z celami, albo `null` = brak wpisu na tę datę
 * („przed wpisem porannym"; steruje FE do akcji „wypełnij rano"). */
export const dayResponseSchema = z.object({ day: daySchema.nullable() });
export type DayResponse = z.infer<typeof dayResponseSchema>;

/** Oznaczenie pojedynczego celu wieczorem. */
export const goalMarkSchema = z.object({
  id: z.string(),
  completed: z.boolean(),
  completedNote: z.string().trim().max(2000).optional(),
});
export type GoalMark = z.infer<typeof goalMarkSchema>;

/** Oznaczenie pojedynczego celu per-cel (natychmiastowy zapis, odpięte od zamykania dnia). */
export const goalMarkPatchSchema = z.object({
  completed: z.boolean(),
  completedNote: z.string().trim().max(2000).optional(),
});
export type GoalMarkPatch = z.infer<typeof goalMarkPatchSchema>;

/** Zamknięcie wieczoru: notatka wieczorna + opcjonalny podzbiór oznaczeń (0..3), których id
 * muszą należeć do dnia (weryfikowane w backendzie). Cele nieoznaczone pozostają jak są. */
export const eveningEntrySchema = z.object({
  goals: z.array(goalMarkSchema).max(3),
  eveningNote: z.string().trim().max(2000).optional(),
});
export type EveningEntry = z.infer<typeof eveningEntrySchema>;

/** Podsumowanie dnia w historii — BEZ pełnych notatek (decyzja @sa).
 * `goalsCompleted` = flagi `completed` celów wg pozycji (null = nieoznaczony). */
export const daySummarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: dayStatusSchema,
  mainTitle: z.string(),
  goalsCompleted: z.array(z.boolean().nullable()),
});
export type DaySummary = z.infer<typeof daySummarySchema>;

/** Historia dni: keyset po dacie malejąco. `nextCursor` = data do `?before=` następnej
 * (starszej) strony, albo `null` gdy nie ma więcej. */
export const dayHistorySchema = z.object({
  items: z.array(daySummarySchema),
  nextCursor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type DayHistory = z.infer<typeof dayHistorySchema>;

/** Parametry zapytania historii. `before` = kursor keyset (data), `limit` domyślnie 30 (max 100). */
export const dayHistoryQuerySchema = z.object({
  before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type DayHistoryQuery = z.infer<typeof dayHistoryQuerySchema>;
