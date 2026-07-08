/**
 * Logika granicy doby (BE-16). „Dzień" = lokalna data użytkownika, wyznaczana serwerowo
 * z jego strefy IANA (`users.timezone`). Czysta, testowalna logika — najłatwiejsze miejsce
 * na bugi (strefy, DST, UTC), więc trzymana osobno i pokryta testami.
 */

/** Lokalna data kalendarzowa `YYYY-MM-DD` dla danej chwili w danej strefie IANA. */
export function localDateInTimeZone(instant: Date, timeZone: string): string {
  // en-CA formatuje jako YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * `YYYY-MM-DD` → północ UTC, do kolumny Prisma `@db.Date`. Świadomie z jawnego stringa UTC,
 * NIGDY z `new Date(localDate)` bez strefy (przesunęłoby dzień) — footgun z review BE-9.
 */
export function dateOnlyUtc(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

/** „Dzisiaj" użytkownika jako `Date` (północ UTC lokalnej daty) — gotowe do zapisu w `Day.date`. */
export function userToday(timeZone: string, now: Date = new Date()): Date {
  return dateOnlyUtc(localDateInTimeZone(now, timeZone));
}

/**
 * Przesuwa datę `YYYY-MM-DD` o `delta` dni (może być ujemne), zwraca `YYYY-MM-DD`.
 * Arytmetyka na północy UTC → odporna na DST (dzień kalendarzowy = stały skok UTC).
 */
export function addDaysIso(localDate: string, delta: number): string {
  const d = dateOnlyUtc(localDate);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
