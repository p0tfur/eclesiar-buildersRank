<template>
  <div class="app-root">
    <header class="app-header">
      <h1>
        VER - <span class="font-bold">V</span>erified <span class="font-bold">E</span>rection
        <span class="font-bold">R</span>eport
      </h1>
      <p>Podgląd i analiza rankingów budowlańców z Eclesiar.</p>
    </header>

    <main class="app-main">
      <section class="filters">
        <form class="filters-form">
          <div class="field-group">
            <label for="building">Budowa</label>
            <select id="building" v-model.number="selectedBuildingId">
              <option :value="0">Wszystkie budowy</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">
                {{ b.region }} – {{ b.type }} (LVL {{ b.level }})
              </option>
            </select>
          </div>

          <div class="field-group">
            <label for="date-from">Od</label>
            <input id="date-from" v-model="dateFrom" type="date" />
          </div>

          <div class="field-group">
            <label for="date-to">Do</label>
            <input id="date-to" v-model="dateTo" type="date" />
          </div>

          <div class="field-group">
            <label for="mode">Tryb</label>
            <select id="mode" v-model="mode">
              <option value="aggregate">Agregowany</option>
              <option value="snapshot">Snapshoty</option>
            </select>
          </div>

          <div class="field-group field-group-button">
            <button
              type="button"
              :disabled="mode !== 'aggregate' || !aggregateItems.length"
              @click="exportAggregateCsv"
            >
              Eksportuj CSV
            </button>
          </div>
        </form>
      </section>

      <section class="results">
        <p v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </p>

        <template v-else>
          <!-- Aggregated view -->
          <template v-if="mode === 'aggregate'">
            <template v-if="!isLoading && aggregateItems.length === 0">
              <p>Brak danych do wyświetlenia dla wybranych filtrów.</p>
            </template>
            <template v-else>
              <section v-if="builderHistory && builderHistory.builderId" class="builder-history">
                <h2>Historia gracza: {{ builderHistory.name }}</h2>

                <p v-if="!builderHistory.items || !builderHistory.items.length">
                  Brak wpisów historii w wybranym okresie.
                </p>

                <table v-else class="results-table">
                  <thead>
                    <tr>
                      <th>Budowa</th>
                      <th>Data</th>
                      <th>Punkty</th>
                      <th>Zmiana punktów</th>
                      <th>Pozycja</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(h, index) in builderHistory.items" :key="h.snapshotId ?? index">
                      <td>{{ h.buildingRegion }} – {{ h.buildingType }} (LVL {{ h.buildingLevel }})</td>
                      <td>{{ formatSnapshotDate(h.capturedAt) }}</td>
                      <td>{{ h.points }}</td>
                      <td>{{ formatDeltaPoints(h.deltaPoints) }}</td>
                      <td>{{ h.rank }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <table class="results-table">
                <thead>
                  <tr>
                    <th>Lp.</th>
                    <th>Gracz</th>
                    <th>Suma punktów</th>
                    <th>Pozycja</th>
                    <th>Liczba wpisów</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in aggregateItems" :key="row.builderId ?? index">
                    <td>{{ index + 1 }}</td>
                    <td>
                      <button type="button" class="link-button" @click="onShowHistory(row)">
                        {{ row.name }}
                      </button>
                    </td>
                    <td>{{ row.totalPoints }}</td>
                    <td>{{ row.averageRank?.toFixed ? row.averageRank.toFixed(2) : row.averageRank }}</td>
                    <td>{{ row.entriesCount }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </template>

          <!-- Snapshots view -->
          <template v-else>
            <p v-if="!isLoading && snapshots.length === 0">Brak snapshotów dla wybranego zakresu dat.</p>

            <div v-else class="snapshot-layout">
              <aside class="snapshot-list">
                <h2>Snapshoty</h2>
                <ul>
                  <li v-for="s in snapshots" :key="s.snapshotId">
                    <button
                      type="button"
                      class="snapshot-item"
                      :class="{ 'snapshot-item--active': s.snapshotId === selectedSnapshotId }"
                      @click="onSelectSnapshot(s.snapshotId)"
                    >
                      <span class="snapshot-date">{{ formatSnapshotDate(s.capturedAt) }}</span>
                      <span class="snapshot-meta"> || {{ s.entries?.length ?? 0 }} wpisów</span>
                    </button>
                  </li>
                </ul>
              </aside>

              <div class="snapshot-table-wrapper" v-if="selectedSnapshot">
                <h2>Ranking dla snapshotu</h2>
                <table class="results-table">
                  <thead>
                    <tr>
                      <th>Lp.</th>
                      <th>Gracz</th>
                      <th>Punkty</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(entry, index) in selectedSnapshot.entries" :key="index">
                      <td>{{ entry.rank }}</td>
                      <td>{{ entry.name }}</td>
                      <td>{{ entry.points }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </template>
      </section>
    </main>
    <footer class="app-footer">
      <p>
        © 2025 VER - Verified Erection Report | Made with ❤️ by
        <a href="https://github.com/p0tfur" target="_blank">p0tfur</a>
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { getBuildings, getRankings, getBuilderHistory } from "./api/api.js";

const buildings = ref<any[]>([]);
const selectedBuildingId = ref<number | null>(0);
const dateFrom = ref<string>("");
const dateTo = ref<string>("");
const mode = ref<"aggregate" | "snapshot">("aggregate");
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const aggregateItems = ref<any[]>([]);
const snapshots = ref<any[]>([]);
const selectedSnapshotId = ref<number | null>(null);

const builderHistory = ref<{ builderId: number | null; name: string; items: any[] }>({
  builderId: null,
  name: "",
  items: [],
});

const canLoad = computed(() => !!dateFrom.value && !!dateTo.value);

function initDefaultDates() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  dateTo.value = to.toISOString().slice(0, 10);
  dateFrom.value = from.toISOString().slice(0, 10);
}

async function loadBuildings() {
  try {
    errorMessage.value = null;
    const result = await getBuildings();
    buildings.value = Array.isArray(result.items) ? result.items : [];
  } catch (err) {
    console.error("[VER] Failed to load buildings", err);
    errorMessage.value = "Nie udało się załadować listy budów.";
  }
}

// automatic data reload on filter change
watch([selectedBuildingId, dateFrom, dateTo, mode], () => {
  if (canLoad.value) {
    loadRankings();
  }
});

async function loadRankings() {
  if (!canLoad.value) {
    return;
  }
  if (mode.value === "snapshot" && !selectedBuildingId.value) {
    // snapshots view requires a specific building
    return;
  }
  isLoading.value = true;
  errorMessage.value = null;
  aggregateItems.value = [];
  snapshots.value = [];
  selectedSnapshotId.value = null;

  try {
    const params: Record<string, unknown> = {
      mode: mode.value,
    };

    if (dateFrom.value) {
      params.from = new Date(dateFrom.value).toISOString();
    }
    if (dateTo.value) {
      params.to = new Date(dateTo.value).toISOString();
    }

    if (mode.value === "snapshot") {
      // snapshots view requires a specific building
      params.buildingId = selectedBuildingId.value;
    } else if (mode.value === "aggregate") {
      // in aggregated view buildingId is optional (0 = all buildings)
      if (selectedBuildingId.value) {
        params.buildingId = selectedBuildingId.value;
      }
    }

    const result = await getRankings(params);
    if (mode.value === "aggregate") {
      if (Array.isArray(result.items)) {
        aggregateItems.value = result.items;
      }
    } else {
      if (Array.isArray(result.snapshots)) {
        snapshots.value = result.snapshots;
        if (snapshots.value.length > 0) {
          selectedSnapshotId.value = snapshots.value[0].snapshotId ?? null;
        }
      }
    }
  } catch (err) {
    console.error("[VER] Failed to load rankings", err);
    errorMessage.value = "Nie udało się załadować rankingów.";
  } finally {
    isLoading.value = false;
  }
}

const selectedSnapshot = computed(() => {
  if (!selectedSnapshotId.value) return null;
  return snapshots.value.find((s) => s.snapshotId === selectedSnapshotId.value) ?? null;
});

function onSelectSnapshot(id: number) {
  selectedSnapshotId.value = id;
}

function formatSnapshotDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function formatDeltaPoints(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value);
  const prefix = v > 0 ? "+" : "";
  return prefix + v.toString();
}

function exportAggregateCsv() {
  if (mode.value !== "aggregate" || !aggregateItems.value.length) {
    return;
  }

  const header = ["Lp.", "BuilderId", "Gracz", "Suma punktów", "Pozycja"];

  const separator = ";";
  const rows: string[] = [];
  rows.push(header.join(separator));

  aggregateItems.value.forEach((row: any, index: number) => {
    const values = [index + 1, row.builderId ?? "", row.name ?? "", row.totalPoints ?? "", row.averageRank ?? ""].map(
      (v) => {
        const text = String(v ?? "");
        const escaped = text.replace(/"/g, '""');
        return `"${escaped}"`;
      }
    );
    rows.push(values.join(separator));
  });

  const csvContent = rows.join("\r\n");
  // Add BOM to ensure Excel correctly detects UTF-8 encoding (for Polish characters in headers)
  const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const fromPart = dateFrom.value || "";
  const toPart = dateTo.value || "";
  a.href = url;
  a.download = `ver-aggregate-${fromPart}-${toPart}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function onShowHistory(row: any) {
  if (!row || !row.builderId) return;
  try {
    errorMessage.value = null;

    // Set builder history context right away so the history section appears on click.
    builderHistory.value = {
      builderId: row.builderId,
      name: row.name,
      items: [],
    };

    const params: Record<string, unknown> = {};

    if (selectedBuildingId.value) {
      params.buildingId = selectedBuildingId.value;
    }
    if (dateFrom.value) {
      params.from = new Date(dateFrom.value).toISOString();
    }
    if (dateTo.value) {
      params.to = new Date(dateTo.value).toISOString();
    }

    const result = await getBuilderHistory(row.builderId, params);
    builderHistory.value = {
      builderId: row.builderId,
      name: result.builderName ?? row.name,
      items: Array.isArray(result.points) ? result.points : [],
    };
  } catch (err) {
    console.error("[VER] Failed to load builder history", err);
    errorMessage.value = "Nie udało się załadować historii gracza.";
  }
}

onMounted(() => {
  initDefaultDates();
  loadBuildings();
});
</script>

<style>
body {
  margin: 0;
  background-color: #020617;
}
</style>

<style scoped>
.app-root {
  min-height: 100vh;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background-color: #0f172a;
  color: #e5e7eb;
  padding: 1.5rem;
  margin: 0;
}

.app-header {
  margin-bottom: 2rem;
}

.app-header h1 {
  font-size: 1.8rem;
  margin-bottom: 0.25rem;
}

.app-header p {
  color: #9ca3af;
}

.app-main {
  background: #020617;
  border-radius: 0.75rem;
  padding: 1.5rem;
  border: 1px solid #1f2937;
}

.info p {
  margin: 0;
}

.filters {
  margin-bottom: 1.5rem;
}

.filters-form {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.field-group {
  display: flex;
  flex-direction: column;
  min-width: 160px;
}

.field-group-button {
  margin-left: auto;
}

.field-group label {
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
}

.field-group input,
.field-group select {
  background-color: #020617;
  color: #e5e7eb;
  border: 1px solid #374151;
  border-radius: 0.375rem;
  padding: 0.4rem 0.6rem;
}

.field-group button {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  border: 1px solid #10b981;
  background-color: #10b981;
  color: #02131c;
  font-weight: 600;
  cursor: pointer;
}

.field-group button:disabled {
  opacity: 0.6;
  cursor: default;
  color: #fff;
  background-color: #020617;
}

.link-button {
  background: none;
  border: none;
  padding: 0;
  color: #38bdf8;
  cursor: pointer;
  text-decoration: underline;
}

.link-button:disabled {
  color: #6b7280;
  cursor: default;
  text-decoration: none;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
}

.results-table th,
.results-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #1f2937;
}

.results-table th {
  text-align: left;
  font-weight: 600;
}

.error-message {
  color: #f97373;
}

.mode-note {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #9ca3af;
}

.app-footer {
  margin-top: 1.5rem;
  font-size: 0.8rem;
  color: #6b7280;
  text-align: center;
}

.app-footer p {
  margin: 0;
}

.app-footer a {
  color: #38bdf8;
  text-decoration: underline;
}

.app-footer a:hover {
  color: #e5e7eb;
}
</style>
