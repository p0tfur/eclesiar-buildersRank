# Plan systemu rankingu budowlańców dla Eclesiar

## 1. Cel i kontekst

- **Cel**: obok eksportu CSV z okna budowy, wysyłać ranking budowlańców do backendu API, który zapisze dane w MySQL i pozwoli przeglądać ranking budowlańców w aplikacji webowej.
- **Źródło danych**: istniejący userscript `Eclesiar_Builders_by_p0tfur.user.js`, który już potrafi:
  - odczytać dane kontekstu budynku: `region`, `buildingType`, `level` (`getPreModalBuildingDetails`).
  - zebrać ranking budowlańców: `[{ rank, player, points }]` (`collectAllDonors`, `parseDonorRanking`).
- **Nowe elementy**:
  - Przycisk w userscriptcie: "Wyślij ranking do VER" .
  - Backend API (TypeScript, Node) zapisujący dane do MySQL (Nazwa APKI: VER - Verified Erection Report)
  - Front (TypeScript, SPA – proponuję Vue 3 + Vite) do przeglądania danych:
    - widok per budowa,
    - filtrowanie po okresie (od/do),
    - tabela z rankingiem budowlańców.

## 2. Przepływ danych end-to-end

1. **Użytkownik** otwiera okno budowy w Eclesiar.
2. **Userscript**:
   - zapewnia, że ranking jest widoczny (`ensureRankingVisible`).
   - zbiera wszystkie wiersze rankingu (`collectAllDonors` ⇒ `[{ rank, player, points }]`).
   - odczytuje kontekst budowy (`{ region, buildingType, level }`).
   - buduje payload JSON i wysyła `POST` do endpointu API.
3. **API**:
   - waliduje payload.
   - wyszukuje lub tworzy odpowiedni rekord budowy (`buildings`).
   - wyszukuje lub tworzy rekordy budowlańców (`builders` / `players`).
   - zapisuje snapshot rankingu (`ranking_snapshots`).
   - zapisuje wiersze rankingu dla snapshotu (`ranking_entries`).
4. **Front**:
   - oferuje wybór budowy (dropdown / lista) – dane z `/api/buildings`.
   - oferuje wybór okresu (data od–do / predefiniowane zakresy: ostatni tydzień, miesiąc itp.).
   - pobiera zagregowane dane rankingu z `/api/rankings`.
   - wyświetla tabelę z rankingiem budowlańców.

## 3. Projekt bazy danych (MySQL) – koncept

### 3.1. Założenia

- Zapamiętujemy **snapshoty** rankingu dla konkretnej budowy w konkretnym momencie.
- Każdy snapshot zawiera wiele wierszy rankingu (jednego budynku) – jeden wiersz na gracza.
- Ranking w UI może być:
  - **snapshotowy** (np. ranking z konkretnej daty/godziny),
  - **zagregowany po okresie** (np. sumaryczne punkty gracza w danym zakresie dat dla konkretnej budowy).
- Zakładamy, że `points` to wartość totalna widoczna w tabeli w danym momencie (nie różnica do poprzedniego snapshotu).

### 3.2. Tabele

1. **`builders`** – budowlańcy / gracze.

   - `id` (PK, BIGINT AUTO_INCREMENT)
   - `name` (VARCHAR, unikalny login/nick z gry)
   - `created_at` (DATETIME)

2. **`buildings`** – budowy.

   - `id` (PK, BIGINT AUTO_INCREMENT)
   - `region` (VARCHAR)
   - `building_type` (VARCHAR)
   - `level` (INT) – poziom
   - _opcjonalnie_: `slug` (VARCHAR, indeks pomocniczy), `extra_info` (JSON) na przyszłość
   - unikalny indeks np. na `(region, building_type, level)` żeby nie dublować budów.

3. **`ranking_snapshots`** – pojedynczy eksport rankingu z danej budowy.

   - `id` (PK, BIGINT AUTO_INCREMENT)
   - `building_id` (FK → `buildings.id`)
   - `captured_at` (DATETIME) – czas utworzenia snapshotu po stronie klienta (z userscriptu)
   - `received_at` (DATETIME) – czas przyjęcia przez API (serwer)
   - `source` (VARCHAR) – np. `"eclesiar-userscript"`
   - `client_user_agent` (TEXT)
   - `page_url` (TEXT)
   - `payload_hash` (CHAR(64) lub podobne) – do ewentualnej deduplikacji
   - indeks po `(building_id, captured_at)`.

4. **`ranking_entries`** – wiersze rankingu w danym snapshotcie.
   - `id` (PK, BIGINT AUTO_INCREMENT)
   - `snapshot_id` (FK → `ranking_snapshots.id`)
   - `builder_id` (FK → `builders.id`)
   - `rank_position` (INT) – pozycja w rankingu
   - `points` (DECIMAL(15,3) UNSIGNED) – pełna wartość punktów z rankingu, z trzema miejscami po przecinku
   - indeksy po `(snapshot_id)`, `(builder_id, snapshot_id)`, ewentualnie `(builder_id)` do szybkich zapytań.

**Uwaga**: plik `.sql` z `CREATE TABLE ...` jest dostępny jako `docs/schema.sql` i został użyty do zdefiniowania bazy VER.

## 4. Projekt monorepo TypeScript w `ver/`

### 4.1. Struktura katalogów

- `ver/`
  - `package.json` – root, monorepo (npm workspaces / pnpm)
  - `tsconfig.base.json` – wspólna konfiguracja TS
  - `packages/`
    - `api/` – backend API (Node + Express/Koa/Fastify w TS; roboczo: Express)
    - `web/` – frontend (Vite + Vue 3 + TypeScript)
  - `docs/`
    - `plan.md` – ten plik (opis architektury i przepływów)
    - `schema.sql` – finalny DDL bazy danych VER (tabele builders, buildings, ranking_snapshots, ranking_entries)

### 4.2. Root `package.json` (high-level)

- Workspaces:
  - `"workspaces": ["packages/api", "packages/web"]`
- Skrypty pomocnicze:
  - `dev` – uruchamia równolegle `api` i `web` (np. przy użyciu `npm-run-all` lub `concurrently`).
  - `build` – buduje oba pakiety.

## 5. Backend API (`packages/api`)

### 5.1. Stos technologiczny

- Node.js (LTS), TypeScript.
- Framework HTTP: Express (dla prostoty).
- ORM / query layer:
  - Możliwe warianty: Knex, Prisma, TypeORM.
  - Propozycja: **Knex** lub "czysty" `mysql2/promise` – prosty model danych, mało encji.
- Konfiguracja bazy z **env** (host, port, user, password, database) – bez twardego kodowania.

### 5.2. Endpointy API (koncept)

1. **`POST /api/rankings/snapshots`** – przyjęcie jednego snapshotu.

   - **Body (JSON)**:

     ```json
     {
       "source": "eclesiar-userscript",
       "capturedAt": "2025-11-21T16:10:00.000Z",
       "pageUrl": "https://eclesiar.com/...",
       "clientUserAgent": "...",
       "building": {
         "region": "Region name",
         "type": "Building type name",
         "level": 2
       },
       "donors": [
         { "rank": 1, "player": "Nick1", "points": "12345" },
         { "rank": 2, "player": "Nick2", "points": "6789" }
       ]
     }
     ```

   - **Zachowanie**:

     - Walidacja danych (basic: wymagane pola, typy, sensownie zakresy).
     - Normalizacja `points` (zamiana przecinków na kropki itp.).
     - `capturedAt`: jeśli brak, użyć czasu serwera.
     - Upsert budowy po `(region, type, level)`.
     - Upsert builderów po `name`.
     - Utworzenie rekordu `ranking_snapshots`.
     - Utworzenie rekordów `ranking_entries` dla każdego donora.
     - Deduplikacja: w oknie **ostatnich 24h** dla danej budowy, jeśli istnieje już snapshot z identycznym `payload_hash`, nie tworzymy nowego snapshotu (zwracamy np. `status: "duplicate"`).

### 5.3. Mechanizm deduplikacji snapshotów

- Po stronie API dla każdego przychodzącego payloadu liczymy `payload_hash` na podstawie:
  - klucza budowy (`region`, `type`, `level`),
  - listy donorów posortowanej w sposób deterministyczny (np. po pozycji w rankingu),
  - wartości `points` znormalizowanej do liczby.
- Przed wstawieniem nowego snapshotu wyszukujemy w `ranking_snapshots` ostatni snapshot dla danej budowy z zakresu `NOW() - 24h`.
- Jeśli znaleziony snapshot ma ten sam `payload_hash`, traktujemy payload jako duplikat: **nie zapisujemy** nowego snapshotu ani entries.
- Jeśli `payload_hash` jest inny, tworzymy nowy snapshot oraz jego wiersze w `ranking_entries`.

  - **Odpowiedź (200)**:
    ```json
    {
      "status": "ok",
      "snapshotId": 123,
      "insertedEntries": 42
    }
    ```

2. **`GET /api/buildings`** – lista budów.

   - **Query params** (opcjonalnie):
     - `region`, `type`, `level` – do filtrowania.
   - **Odpowiedź**:
     ```json
     {
       "items": [
         {
           "id": 1,
           "region": "Region A",
           "type": "Castle",
           "level": 3
         }
       ]
     }
     ```

3. **`GET /api/rankings`** – ranking budowlańców w zadanym okresie.

   - **Query params**:

     - `buildingId` (opcjonalny w trybie agregowanym, **wymagany** w trybie snapshotowym).
     - `from` (ISO date/datetime, opcjonalne – domyślnie np. ostatnie 7 dni).
     - `to` (ISO date/datetime, opcjonalne – domyślnie teraz).
     - `mode` (opcjonalne):
       - `"snapshot"` – zwróć listę snapshotów z osobnymi rankingami.
       - `"aggregate"` – **aktualnie**:
         - jeśli podany `buildingId` → używany jest **najnowszy snapshot** w zadanym zakresie dat dla tej budowy,
         - jeśli `buildingId` pominięty → dla **każdej budowy** wybierany jest jej najnowszy snapshot w zakresie, a punkty gracza są sumą punktów z tych najnowszych snapshotów (stan "na dzisiaj" dla wszystkich budów).

   - **Odpowiedź dla `mode=aggregate` (propozycja)**:

     ```json
     {
       "building": {
         "id": 1,
         "region": "Region A",
         "type": "Castle",
         "level": 3
       },
       "from": "2025-11-01T00:00:00.000Z",
       "to": "2025-11-21T23:59:59.000Z",
       "items": [
         {
           "builderId": 10,
           "name": "Nick1",
           "totalPoints": 123456,
           "averageRank": 1.5,
           "entriesCount": 12
         }
       ]
     }
     ```

   - **Odpowiedź dla `mode=snapshot` (propozycja)**:
     ```json
     {
       "building": { ... },
       "snapshots": [
         {
           "snapshotId": 123,
           "capturedAt": "2025-11-21T16:10:00.000Z",
           "entries": [
             { "rank": 1, "name": "Nick1", "points": 12345 },
             { "rank": 2, "name": "Nick2", "points": 6789 }
           ]
         }
       ]
     }
     ```

4. **`GET /api/builders/:id/history`** – historia gracza.

   - **Status**: zaimplementowany.
   - **Parametry**:
     - `:id` – identyfikator gracza (`builderId`).
     - `buildingId` (query, opcjonalny) – identyfikator budowy; jeśli pominięty, historia obejmuje wszystkie budowy.
     - `from`, `to` (query, opcjonalne) – zakres dat, działa jak w `GET /api/rankings`.
   - **Zachowanie**:
     - zwraca listę wpisów posortowanych rosnąco po czasie (`points`, `rank`, `capturedAt`),
     - każdy wpis zawiera również informacje o budowie (`buildingId`, `buildingRegion`, `buildingType`, `buildingLevel`), co pozwala wyświetlić historię udziału gracza we wszystkich budowach,
     - używane we froncie do rysowania tabeli historii po kliknięciu w gracza.

### 5.3. Bezpieczeństwo i CORS

- API będzie wołane z userscripta osadzonego na domenie `eclesiar.com`.
- Należy skonfigurować CORS tak, by:
  - zezwolić na origin `https://eclesiar.com` oraz `https://www.eclesiar.com` (i ewentualne subdomeny potrzebne dla gry).
  - przyjmować `Content-Type: application/json`.
- Autoryzacja:
  - Zaimplementowano prosty mechanizm API key oparty o nagłówek `X-VER-API-KEY`.
  - Klucze są konfigurowane w `.env` w zmiennej `VER_API_KEY` jako lista rozdzielana przecinkami (multi-key support).
  - Endpoint `POST /api/rankings/snapshots` wymaga poprawnego klucza; pozostałe endpointy są publiczne.

## 6. Frontend (`packages/web`) – projekt

### 6.1. Stos technologiczny

- Vite + Vue 3 (Composition API) + TypeScript.
- Stylowanie: prosty CSS / Tailwind / Bootstrap – do ustalenia (na początek można minimalistycznie, byle czytelnie).
- Plik `src/api/api.js` – **zgodnie z regułą** trzymamy tam stałe URL do endpointów i funkcje fetchujące dane.

### 6.2. Struktura widoków

1. **Widok główny: "Ranking budowlańców"**

   - Sekcja filtrów:

     - Select: Budowa (ładowane z `/api/buildings`).
     - Date range: `od` / `do` (domyślnie np. ostatnie 7 dni).
     - Select: tryb widoku (`Aggregate` / `Snapshot`).
     - Przycisk `Odśwież`.

   - Tabela wyników (dla `Aggregate`):

     - Kolumny: `Lp.`, `Gracz`, `Suma punktów`, `Średnia pozycja`, `Liczba wpisów`.
     - Sortowanie po `Suma punktów` (domyślnie malejąco), możliwość zmiany kolumny sortowania.

   - Tabela wyników (dla `Snapshot`):
     - Lista snapshotów (np. akordeon lub dropdown z datą).
     - Po wyborze snapshotu – tabela `rank`, `gracz`, `punkty`.

2. **Komponenty pomocnicze**:

   - `FiltersPanel.vue` – filtry (budowa, zakres dat, tryb).
   - `RankingsTableAggregate.vue`.
   - `RankingsTableSnapshot.vue`.

### 6.3. Logika (Composition API)

- Reactive state (stan faktyczny):
  - `buildings`, `selectedBuildingId` (0 = wszystkie budowy), `dateFrom`, `dateTo`, `mode` (`aggregate` / `snapshot`),
  - `aggregateItems`, `snapshots`, `selectedSnapshotId`,
  - `builderHistory` (aktualnie wybrany gracz + lista wpisów historii),
  - `isLoading`, `errorMessage`.
- Efekty uboczne:
  - `loadBuildings()` na `onMounted` (ładuje listę budów),
  - `loadRankings()` wywoływane **automatycznie** przez `watch` przy każdej zmianie filtrów (`selectedBuildingId`, `dateFrom`, `dateTo`, `mode`).
- Obsługa błędów:
  - Wyświetlanie komunikatu o błędzie nad tabelą.
  - Logowanie błędów w konsoli.

## 7. Integracja userscriptu z API

### 7.1. Nowy przycisk w `Eclesiar_Builders_by_p0tfur.user.js`

- Obecnie:

  - `ensureExportButtons` tworzy przycisk `Export CSV`, który:
    - woła `ensureRankingVisible`,
    - zbiera `donors` (`collectAllDonors`),
    - buduje CSV (`buildCsv`),
    - pobiera plik (`downloadCsv`).

- Planowana zmiana:
  - Wprowadzić **nowy przycisk** `Wyślij do API` obok `Export CSV` **lub** zmienić istniejący przycisk (do ustalenia – preferuję pozostawić oba, żeby nie psuć dotychczasowego flow).
  - Dodać stałą z URL API, np. `RANKING_API_ENDPOINT`.
  - Dodać funkcję `sendRankingToApi(donors, context)`:
    - `context` z `getPreModalBuildingDetails(document)` + `pageUrl`, `userAgent`, `capturedAt`.
    - Budowa JSON wg kontraktu `POST /api/rankings/snapshots`.
    - Wysłanie requestu `fetch`em z `Content-Type: application/json`.
    - Obsługa błędów: `console.error` + `alert` z krótką informacją.

### 7.2. Przebieg kliknięcia nowego przycisku

1. Klik `Wyślij do API`.
2. `ensureRankingVisible(document)`.
3. `collectAllDonors(document)` ⇒ `donors`.
4. `getPreModalBuildingDetails(document)` ⇒ `building context`.
5. Zbudowanie payloadu JSON.
6. `fetch(RANKING_API_ENDPOINT, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) })`.
7. Na sukces – krótki komunikat (`alert` albo inline informacja w DOM, do ustalenia).

## 8. Plan wdrożenia krok po kroku

1. **Akceptacja planu** (ten dokument).
2. **Doprecyzowanie**:
   - Czy przycisk CSV ma zostać, czy ma być zastąpiony przyciskiem API?
   - Czy ranking per okres ma być liczony jako:
     - suma punktów ze wszystkich snapshotów w okresie,
     - czy np. bazować na ostatnim snapshotcie w okresie?
3. **Ustalenie technologii po stronie API** (ORM vs. czyste SQL) i sposobu autoryzacji (jeśli potrzebna).
4. **Przygotowanie pliku `schema.sql`** na podstawie sekcji 3.
5. **Utworzenie monorepo `ver/`**:
   - `package.json` + workspaces.
   - `packages/api` (TS + Express + konfiguracja DB).
   - `packages/web` (Vite + Vue 3 + TS + `src/api/api.js`).
6. **Implementacja endpointu `POST /api/rankings/snapshots`** + zapis do MySQL.
7. **Implementacja endpointów odczytu (`GET /api/buildings`, `GET /api/rankings`)**.
8. **Implementacja frontendu**:
   - widok filtrów,
   - tabele `Aggregate` i `Snapshot`,
   - połączenie z API.
9. **Modyfikacja userscriptu**:
   - dodanie przycisku,
   - wysyłka payloadu do API,
   - prosty feedback dla użytkownika.
10. **Testy end-to-end**:
    - ręczne: wysłanie kilku snapshotów z gry,
    - weryfikacja zapisów w DB (phpMyAdmin),
    - weryfikacja działania filtra per budowa i per okres na froncie.

## 9. Status realizacji VER

- **Baza danych**:
  - `docs/schema.sql` utworzony i gotowy do użycia (tabele: `builders`, `buildings`, `ranking_snapshots`, `ranking_entries`).
- **Backend (API)**:
  - wdrożone endpointy:
    - `GET /api/health` – prosty healthcheck + sprawdzenie połączenia z MySQL,
    - `POST /api/rankings/snapshots` – przyjmuje snapshot, wykonuje walidację, normalizację `points`, upsertuje budowę i graczy, zapisuje snapshot + wiersze rankingu,
    - `GET /api/buildings` – zwraca listę budów,
    - `GET /api/rankings` – zwraca ranking w trybie agregowanym oraz snapshotowym (zgodnie z parametrem `mode`).
  - zaimplementowany mechanizm deduplikacji snapshotów (24h + `payload_hash`).
- **Frontend (VER web)**:
  - widok główny zawiera:
    - wybór budowy z opcją `Wszystkie budowy` (0) – w tym trybie agregacja sumuje punkty z najnowszych snapshotów wszystkich budów,
    - wybór zakresu dat,
    - wybór trybu (`aggregate` / `snapshot`),
    - tabelę wyników w trybie agregowanym (`totalPoints`, `averageRank`, `entriesCount`),
    - widok snapshotów: listę snapshotów w zadanym okresie oraz tabelę wpisów dla wybranego snapshotu,
    - sekcję **historii gracza** nad tabelą agregatu, pojawiającą się po kliknięciu w gracza (tylko dla konkretnej budowy).
  - komunikaty o błędach oraz stan ładowania sygnalizowane w UI.
  - filtry (`Budowa`/`Od`/`Do`/`Tryb`) powodują automatyczne przeładowanie danych (brak ręcznego przycisku `Załaduj`).
- **Userscript Eclesiar**:
  - istniejący przycisk `Export CSV` pozostaje bez zmian,
  - dodany przycisk **"Wyślij ranking do VER"**, który:
    - zapewnia widoczność rankingu,
    - zbiera donorów,
    - buduje payload zgodny z kontraktem API,
    - wysyła `POST` do endpointu VER z nagłówkiem `X-VER-API-KEY` (wartość konfigurowalna w skrypcie),
    - raportuje sukces/błąd w `alert` + logi w konsoli.

### Możliwe rozszerzenia na przyszłość

- Rozbudowa widoku **snapshotów** po stronie frontendu (np. oś czasu, porównywanie snapshotów).
- Dodatkowe metryki (np. różnice punktów między kolejnymi snapshotami, udział procentowy w budowie).

## 10. Rekomendowane następne kroki

1. **Metryki zmian punktów**:
   - obliczanie przyrostów między kolejnymi snapshotami dla gracza,
   - pokazanie w historii różnicy względem poprzedniego wpisu.
2. **Lepsze UX w historii gracza**:
   - prosty wykres (np. liniowy) punktów w czasie,
   - filtr po minimalnej liczbie snapshotów / po regionie.
3. **Eksport/raporty**:
   - eksport widoku agregowanego do CSV/JSON bezpośrednio z frontendu.
4. **Hardening API**:
   - rate limiting dla `POST /api/rankings/snapshots`,
   - ewentualny log audytowy (kto i z jakiego klucza wysyła snapshoty).

> Rozbudowa widoku **snapshotów** (oś czasu, porównania) pozostaje opcją na przyszłość, ale przy obecnym założeniu jednego snapshotu na budowę nie jest priorytetem.

---

Po Twojej akceptacji tego planu mogę:

- przygotować konkretny plik `schema.sql` z `CREATE TABLE ...`,
- założyć szkielet monorepo w `ver/`,
- a następnie dodać przycisk i logikę wysyłki danych w userscriptcie.
