import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiRequestError, GENERIC_API_ERROR, resetStreak } from '../lib/api';
import { useStreakRefresh } from './streak-refresh';

/**
 * Reset serii (FE-C). Przycisk przy odznace serii w nagłówku (globalny chrome AppShell) z
 * DIALOGIEM POTWIERDZENIA, bo to akcja destrukcyjna i NIEODWRACALNA (zeruje `current`; `longest`
 * i `totalDays` zostają po stronie BE).
 *
 * Filozofia właściciela: „apka dla samokontroli, nie apka mnie kontroluje" — reset ma być łatwo
 * dostępny (jeden klik + potwierdzenie), ale nie przypadkowy.
 *
 * MODALNOŚĆ: używamy NATYWNEGO `<dialog>` + `showModal()` (CR M1). Daje za darmo i poprawnie:
 * focus trap, `Esc`→zamknięcie (zdarzenie `cancel`), `inert` tła, przywrócenie focusa na element
 * wywołujący po `close()`. To lepsze niż ręczny `role="dialog" aria-modal` bez zarządzania focusem
 * i bez dodatkowej zależności (Radix itp. nie jest w stacku FE). W trakcie żądania (`resetting`)
 * blokujemy zamknięcie — także `Esc` (preventDefault na `cancel`).
 *
 * Po sukcesie: `bumpStreak()` z `useStreakRefresh` → `StreakBadge` przeładowuje serię od razu
 * (ten sam mechanizm co po zamknięciu dnia). Błąd (sieć/HTTP) → komunikat w dialogu; dialog zostaje
 * otwarty, żeby użytkownik mógł ponowić lub anulować.
 */
export function StreakReset(): ReactNode {
  const { bumpStreak } = useStreakRefresh();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sterujemy natywnym dialogiem imperatywnie: React renderuje `<dialog>`, ale modalność (backdrop,
  // focus trap, inert tła) włącza dopiero `showModal()`. `close()` zamyka i przywraca focus na trigger.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog(): void {
    setError(null);
    setOpen(true);
  }

  function closeDialog(): void {
    if (resetting) return; // nie zamykaj w trakcie żądania
    setOpen(false);
    setError(null);
  }

  async function confirmReset(): Promise<void> {
    setError(null);
    setResetting(true);
    // resetStreak rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci) — oba w try.
    try {
      await resetStreak();
      setOpen(false);
      bumpStreak();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : GENERIC_API_ERROR);
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <button type="button" className="streak-reset-trigger" onClick={openDialog}>
        Resetuj serię
      </button>

      <dialog
        ref={dialogRef}
        className="dialog"
        aria-labelledby="streak-reset-title"
        // Esc → natywny `cancel`. Blokujemy zamknięcie w trakcie żądania; poza tym zamykamy przez stan.
        onCancel={(e) => {
          e.preventDefault();
          closeDialog();
        }}
        // Klik w backdrop trafia w sam `<dialog>` (dzieci są w `.dialog-body`); zamykamy jak „Anuluj".
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <div className="dialog-body">
          <h2 id="streak-reset-title">Zresetować serię?</h2>
          <p>
            Wyzerujesz bieżącą serię (spadnie do 0). Rekord i łączna liczba dni zostają. Ta akcja
            jest nieodwracalna.
          </p>

          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="dialog-actions">
            <button
              type="button"
              className="button button-danger"
              onClick={() => void confirmReset()}
              disabled={resetting}
            >
              {resetting ? 'Zerowanie…' : 'Tak, zeruj'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeDialog}
              disabled={resetting}
            >
              Anuluj
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
