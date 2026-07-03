# Trzy Cele — dokumentacja biznesowa

> Dokument dla osób **nietechnicznych** (biznes, produkt). Wyjaśnia czym jest aplikacja,
> jakie decyzje podjęliśmy i dlaczego, ile to kosztuje oraz w którą stronę może się rozwijać.
> Wersja: MVP (planowanie). Data: 2026-07.

---

## 1. W jednym zdaniu

**Trzy Cele** to prywatny, cyfrowy dziennik codziennej dyscypliny: rano zapisujesz
**jeden najważniejszy cel** i **dwa poboczne**, a wieczorem odznaczasz, co udało się dowieźć.

Aplikacja z założenia jest **prosta i osobista** — to nie jest korporacyjny system do zarządzania
projektami, tylko narzędzie budowania nawyku „codziennie wiem, co jest najważniejsze".

---

## 2. Dla kogo i po co

- **Odbiorca na start:** jedna osoba (właściciel). W przyszłości maksymalnie kilka osób.
  Świadomie **nie** budujemy dużego produktu SaaS — to wpływa na koszty (patrz sekcja 6).
- **Problem, który rozwiązuje:** rozproszenie i brak fokusu. Zmusza do wyboru
  *jednej* rzeczy naprawdę ważnej dziennie, zamiast listy 20 zadań, z której nic nie wychodzi.
- **Charakter:** to **dziennik**, nie aplikacja z przypomnieniami. Nie „szturcha" powiadomieniami —
  wracasz do niej sam, z własnej woli (świadoma decyzja produktowa).

---

## 3. Jak to działa — codzienny rytm

| Pora | Co robi użytkownik |
|------|--------------------|
| **Rano** | Wpisuje 1 cel główny + 2 poboczne. Opcjonalnie krótka notatka do każdego. |
| **Wieczorem** | Odznacza dla każdego celu: dowieziony / nie. Może dopisać notatkę-refleksję. |
| **W czasie** | Przegląda historię: co udało się w poprzednich dniach, jak długo utrzymuje serię (streak). |

---

## 4. System punktów (planowany — po MVP)

Pomysł na grywalizację, który **dodamy w kolejnym etapie** (MVP działa bez niego):

- Cel poboczny **wykonany** → **+0,5 pkt** (za dwa poboczne max +1 pkt/dzień).
- Cel główny **niewykonany** → **−1 pkt** (kara).
- Cel główny **wykonany** → **0 pkt** (brak nagrody — to jest „obowiązek", nie bonus).
- **Koło ratunkowe:** raz w miesiącu można anulować karę za niewykonany cel główny
  (np. choroba, ważne wydarzenie życiowe).
- **Konto administratora** (w przyszłości): może ręcznie anulować karę w wyjątkowych sytuacjach.

### ⚠️ Trzy pytania produktowe do decyzji biznesu

To nie są problemy techniczne — to wybory, które kształtują „charakter" aplikacji.
Prosimy o świadome potwierdzenie:

1. **Asymetria punktów.** Cel główny: wykonany = 0 pkt, niewykonany = −1 pkt.
   Czyli dzień, w którym zrobiłeś *tylko* cel główny = 0 pkt. Czy to zamierzone?
   *(Alternatywa: nagradzać też cel główny, np. +1 pkt — inne odczucie z produktu.)*

2. **Brak wieczornego przeglądu.** Jeśli użytkownik wieczorem nic nie odznaczy —
   traktujemy cel główny jako niewykonany (−1 pkt) czy jako stan neutralny (0 pkt)?

3. **Sposób użycia koła ratunkowego.** Użytkownik świadomie „wydaje" koło ratunkowe
   (klika: nie odejmuj mi punktu), czy stosuje się ono automatycznie przy pierwszym
   braku w miesiącu?

Odpowiedzi na te pytania wpływają na logikę naliczania punktów — dlatego pytamy wcześnie.

---

## 5. Plan wdrożenia — etapami

Budujemy przyrostowo. Najpierw najmniejsza działająca wersja, potem kolejne warstwy.

| Etap | Co dostaje użytkownik | Status |
|------|------------------------|--------|
| **0. Fundament** | Nic widocznego — sprawdzamy, że logowanie i „instalacja w chmurze" działają end-to-end. | do zrobienia |
| **1. MVP** | Logowanie · rano 3 cele + notatki · wieczorem odznaczanie · historia dni · licznik serii. | do zrobienia |
| **2. Punkty** | System punktowy (+0,5 / −1), suma i seria punktowa. | plan |
| **3. Koło ratunkowe + Admin** | Limit 1 koło/miesiąc · konto administratora (anulowanie kary, podgląd). | plan |
| **4. Dopieszczenie** | Statystyki, wykresy, eksport dziennika. | plan |

**Świadomie POZA zakresem** (na teraz): przypomnienia push/e-mail, aplikacja natywna
na telefon, tryb offline. Aplikacja działa jako **responsywna strona** — otworzysz ją
w przeglądarce na telefonie i komputerze.

---

## 6. Koszty

Cel: **maksymalnie tanio**, docelowo blisko **0 zł/mies.** przy jednym–kilku użytkownikach.

| Element | Koszt na start |
|---------|----------------|
| Aplikacja (strona + serwer w jednym) | 0 zł na darmowym planie **Render** |
| Baza danych | 0 zł (darmowy plan, „usypia" gdy nieużywana) |
| Logowanie | 0 zł (rozwiązanie w naszej własnej bazie, bez zewnętrznego dostawcy) |

> **Kompromis darmowego planu (świadomy):** przy darmowym hostingu serwer „usypia" po ~15 min bezczynności
> i budzi się 30–50 s. Ponieważ dziennik otwierasz zwykle rano i wieczorem, **pierwsze wejście w danej porze
> może chwilę czekać** na obudzenie. Akceptujemy to na start. Jeśli będzie przeszkadzać, rozwiązania to
> automatyczne „budzenie" serwera przed porankiem/wieczorem albo mały własny serwer za ~20 zł/mies. (bez usypiania).

**Ważna decyzja o ryzyku:** rekomendujemy **NIE** stawiać aplikacji na firmowym koncie AWS
(dostęp z pracy). Powód: rachunki są widoczne dla pracodawcy, tracisz dostęp przy zmianie
pracy, a regulaminy kont firmowych zwykle nie przewidują prywatnych projektów.
Stawiamy na własny, tani, niezależny hosting — koszt i tak bliski zeru, bez tego ryzyka.

---

## 7. Filozofia techniczna po ludzku: „brak uzależnienia od dostawcy"

Właściciel poprosił, by aplikacji dało się w razie potrzeby **przenieść** do innego dostawcy
bez przepisywania jej od nowa. Zrealizowaliśmy to tak:

- Aplikacja jest „zapakowana" w standardowy, przenośny format (kontener) —
  uruchomi się identycznie u dowolnego dostawcy.
- Baza danych i logowanie używają **otwartych standardów**, nie zamkniętych usług
  jednej konkretnej chmury.
- Efekt: „przeniesienie na inny hosting" = zmiana ustawień i ponowne uruchomienie,
  a **nie** budowa aplikacji od zera.

To trochę droższe w budowie niż „przyspawanie się" do jednego dostawcy, ale kupuje
niezależność i przewidywalność kosztów — świadomy wybór zgodny z życzeniem właściciela.

---

## 8. Otwarte pytania do biznesu (zbiorczo)

1. Trzy pytania o punkty z sekcji 4.
2. Czy w przyszłości aplikacja ma być udostępniana innym (np. znajomym) — jeśli tak,
   ilu osobom orientacyjnie? (wpływa na przyszłe koszty i model kont).
3. Czy eksport dziennika (etap 4) jest ważny — w jakim formacie (PDF do druku? plik danych?).
4. Nazwa produktu — robocza to „Trzy Cele". Czy zostaje?
