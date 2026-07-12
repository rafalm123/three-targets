import { describe, expect, it } from 'vitest';
import { computeStreak } from './streak';

const TODAY = '2026-07-08';

describe('computeStreak', () => {
  it('brak dni → same zera', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, longest: 0, totalDays: 0 });
  });

  it('current: dziś closed + dwa poprzednie → 3', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07', '2026-07-08'], TODAY);
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.totalDays).toBe(3);
  });

  it('grace dla „dziś": dziś NIE closed, wczoraj i przedwczoraj closed → current 2', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07'], TODAY);
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
  });

  it('dziś closed, wczoraj luka → current 1 (dziś liczy się mimo braku wczoraj)', () => {
    const r = computeStreak(['2026-07-08'], TODAY);
    expect(r).toEqual({ current: 1, longest: 1, totalDays: 1 });
  });

  it('przerwa w przeszłości zrywa current (dziś nie closed, luka wczoraj)', () => {
    // wczoraj (07-07) brak → seria bieżąca zaczyna się i od razu kończy
    const r = computeStreak(['2026-07-05', '2026-07-06'], TODAY);
    expect(r.current).toBe(0);
  });

  it('longest liczy najdłuższą serię w historii, niezależnie od bieżącej', () => {
    // seria 4 dni w przeszłości, przerwa, potem 1 dzień; dziś nie closed
    const r = computeStreak(
      ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-06-01'],
      TODAY,
    );
    expect(r.longest).toBe(4);
    expect(r.totalDays).toBe(5);
    expect(r.current).toBe(0);
  });

  it('przeskok miesiąca jest ciągły kalendarzowo (31 sty → 1 lut)', () => {
    const r = computeStreak(['2026-01-31', '2026-02-01', '2026-02-02'], '2026-02-02');
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
  });

  it('current niezależny od kolejności wejścia', () => {
    const r = computeStreak(['2026-07-08', '2026-07-06', '2026-07-07'], TODAY);
    expect(r.current).toBe(3);
  });

  // BE-20 — floorDate (ręczny reset serii): cofając `current` zatrzymuje się na dniach `< floorDate`.
  // longest/totalDays liczone z PEŁNEGO zbioru (bez floora).
  it('floorDate = dziś: current liczy tylko dziś, longest/totalDays z pełnego zbioru', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07', '2026-07-08'], TODAY, TODAY);
    expect(r.current).toBe(1); // tylko dziś (07-06, 07-07 < floor → odcięte)
    expect(r.longest).toBe(3); // pełny zbiór, bez floora
    expect(r.totalDays).toBe(3);
  });

  it('floorDate = dziś, dziś NIE w zbiorze (grace) → current 0 (wczoraj < floor)', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07'], TODAY, TODAY);
    expect(r.current).toBe(0); // start od wczoraj (07-07) < floor (07-08) → nic nie liczy
    expect(r.longest).toBe(2);
    expect(r.totalDays).toBe(2);
  });

  it('floorDate w środku serii: current liczy tylko od floora wzwyż', () => {
    // seria 07-05..07-08, floor 07-07 → current liczy 07-08, 07-07; 07-06,07-05 < floor
    const r = computeStreak(['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'], TODAY, '2026-07-07');
    expect(r.current).toBe(2);
    expect(r.longest).toBe(4);
    expect(r.totalDays).toBe(4);
  });

  it('floorDate w przeszłości (przed serią) → bez wpływu na current', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07', '2026-07-08'], TODAY, '2000-01-01');
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
  });

  it('floorDate undefined → zachowanie jak dotąd', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07', '2026-07-08'], TODAY, undefined);
    expect(r.current).toBe(3);
  });

  // BE-20 — reset ustawia floor = JUTRO (> today). Nawet z dowiezionym dziś głównym current=0
  // (kursor startuje na dziś, ale dziś < floor → pętla nic nie liczy). Pinuje poprawność warunku pętli.
  it('floorDate > today (jutro) → current 0 nawet gdy dziś w zbiorze; longest/totalDays z pełnego zbioru', () => {
    const r = computeStreak(['2026-07-06', '2026-07-07', '2026-07-08'], TODAY, '2026-07-09');
    expect(r.current).toBe(0);
    expect(r.longest).toBe(3);
    expect(r.totalDays).toBe(3);
  });
});
