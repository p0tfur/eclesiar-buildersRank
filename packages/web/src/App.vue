<template>
  <div class="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-orange-500/30">
    <!-- Top Navigation / Header -->
    <header class="sticky top-0 z-40 w-full backdrop-blur-lg bg-slate-950/80 border-b border-slate-800/60">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
            <span class="text-xl">🦊</span>
          </div>
          <div>
            <h1 class="font-bold text-lg tracking-tight text-white flex items-center gap-2">
              VER <span class="text-slate-500 font-normal mx-1">|</span>
              <span class="text-orange-400">Verified Erection Report</span>
            </h1>
            <p class="text-xs text-slate-400">Advanced Erection Analytics Dashboard</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div
            class="hidden md:flex items-center gap-2 text-xs font-mono text-orange-300/80 bg-orange-900/20 px-3 py-1.5 rounded-full border border-orange-500/20"
          >
            <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
            SENKO-SAN WATCHING
          </div>
        </div>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8 space-y-6">
      <section class="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
        <div class="flex items-center gap-2 text-sm text-slate-300">
          <FlameIcon class="w-4 h-4 text-orange-400" />
          <span class="font-semibold">Reward Points</span>
          <span class="font-mono text-orange-400">{{ totalBuildingPoints }}</span>
        </div>
        <div class="text-xs text-slate-400">
          Rewards:
          <span class="font-mono text-orange-300">{{ completedRewards }}</span>
          <span class="mx-2 text-slate-600">|</span>
          To next reward:
          <span class="font-mono text-slate-200">{{ pointsToNextReward }}</span>
          pts
        </div>
      </section>

      <!-- Control Panel -->
      <section
        class="bg-slate-900/50 border border-slate-800 rounded-xl p-1 shadow-xl backdrop-blur-sm relative overflow-visible"
      >
        <!-- Fox tail decoration -->
        <div
          class="absolute -right-10 -top-10 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl pointer-events-none"
        ></div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 p-2 relative z-100">
          <!-- Building Multiselect -->
          <div class="md:col-span-3 relative group">
            <label
              class="absolute -top-2.5 left-3 px-1 bg-slate-900 text-[10px] font-bold text-slate-500 uppercase tracking-wider z-50 pointer-events-none"
              >Project Site</label
            >
            <div class="relative">
              <BuildingIcon
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors z-100"
              />
              <!-- Multiselect trigger button -->
              <button
                type="button"
                @click="toggleMultiselect"
                class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg pl-10 pr-8 py-2.5 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none cursor-pointer hover:bg-slate-900 text-left truncate"
              >
                {{ multiselectDisplayText }}
              </button>
              <ChevronDownIcon
                class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none transition-transform"
                :class="{ 'rotate-180': isMultiselectOpen }"
              />

              <!-- Dropdown panel - teleported to body for proper z-index stacking -->
              <Teleport to="body">
                <div
                  v-if="isMultiselectOpen"
                  data-multiselect-dropdown
                  class="fixed bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-64 overflow-y-auto custom-scrollbar"
                  :style="dropdownStyle"
                >
                  <!-- All Sites option -->
                  <button
                    type="button"
                    @click="selectAllBuildings"
                    class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors border-b border-slate-800"
                    :class="selectedBuildingIds.length === 0 ? 'text-orange-400 bg-slate-800/50' : 'text-slate-300'"
                  >
                    <div
                      class="w-4 h-4 border rounded flex items-center justify-center"
                      :class="selectedBuildingIds.length === 0 ? 'border-orange-500 bg-orange-500' : 'border-slate-600'"
                    >
                      <CheckIcon v-if="selectedBuildingIds.length === 0" class="w-3 h-3 text-white" />
                    </div>
                    All Sites / Global View
                  </button>

                  <!-- Individual buildings -->
                  <button
                    v-for="b in buildings"
                    :key="b.id"
                    type="button"
                    @click="toggleBuildingSelection(b.id)"
                    class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors"
                    :class="selectedBuildingIds.includes(b.id) ? 'text-orange-400 bg-slate-800/30' : 'text-slate-300'"
                  >
                    <div
                      class="w-4 h-4 border rounded flex items-center justify-center flex-shrink-0"
                      :class="
                        selectedBuildingIds.includes(b.id) ? 'border-orange-500 bg-orange-500' : 'border-slate-600'
                      "
                    >
                      <CheckIcon v-if="selectedBuildingIds.includes(b.id)" class="w-3 h-3 text-white" />
                    </div>
                    <span class="truncate">{{ formatBuildingOption(b) }}</span>
                  </button>
                </div>
              </Teleport>
            </div>

            <!-- Selected count badge -->
            <div
              v-if="selectedBuildingIds.length > 0"
              class="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
            >
              {{ selectedBuildingIds.length }}
            </div>
          </div>

          <!-- Aggregation Range -->
          <div class="md:col-span-4 grid grid-cols-1 gap-2">
            <div class="relative group">
              <label
                class="absolute -top-2.5 left-3 px-1 bg-slate-900 text-[10px] font-bold text-slate-500 uppercase tracking-wider z-50 pointer-events-none"
                >Buildings to aggregate</label
              >
              <div class="relative flex items-center gap-2">
                <div class="relative flex-1">
                  <CalendarIcon
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors"
                  />
                  <select
                    v-model.number="rangeDays"
                    class="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all outline-none appearance-none cursor-pointer hover:bg-slate-900"
                  >
                    <option v-for="d in rangeOptions" :key="d" :value="d">Last {{ d }} buildings</option>
                  </select>
                </div>
                <div class="flex flex-col gap-1">
                  <button
                    type="button"
                    @click="decrementRangeDays"
                    class="px-2 py-0.5 text-xs rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300"
                    title="-1 building"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    @click="incrementRangeDays"
                    class="px-2 py-0.5 text-xs rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300"
                    title="+1 building"
                  >
                    +1
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- View Mode -->
          <div class="md:col-span-3 relative group">
            <label
              class="absolute -top-2.5 left-3 px-1 bg-slate-900 text-[10px] font-bold text-slate-500 uppercase tracking-wider z-10"
              >Analysis Mode</label
            >
            <div class="flex bg-slate-950 rounded-lg border border-slate-800 p-1 h-[42px]">
              <button
                @click="mode = 'aggregate'"
                class="flex-1 flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-all"
                :class="
                  mode === 'aggregate'
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-orange-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                "
              >
                <BarChart3Icon class="w-3.5 h-3.5" />
                Aggregate
              </button>
              <button
                @click="mode = 'snapshot'"
                class="flex-1 flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-all"
                :class="
                  mode === 'snapshot'
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-orange-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                "
              >
                <CameraIcon class="w-3.5 h-3.5" />
                Snapshots
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="md:col-span-2">
            <button
              type="button"
              :disabled="mode !== 'aggregate' || !aggregateItems.length"
              @click="exportAggregateCsv"
              class="w-full h-[42px] flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-slate-950 text-sm font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 shadow-lg shadow-orange-500/20"
            >
              <DownloadIcon class="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Error State -->
      <div
        v-if="errorMessage"
        class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2"
      >
        <AlertCircleIcon class="w-5 h-5 shrink-0" />
        <p>{{ errorMessage }}</p>
      </div>

      <!-- AGGREGATE VIEW -->
      <template v-if="mode === 'aggregate'">
        <!-- Builder History (The "Spotlight" Card) -->
        <section
          v-if="builderHistory.builderId"
          class="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl transition-all animate-in fade-in zoom-in-95"
        >
          <div
            class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 via-yellow-400 to-red-400"
          ></div>

          <div class="flex flex-col md:flex-row gap-6">
            <div class="md:w-1/3 space-y-4">
              <div class="flex items-center gap-3">
                <div
                  class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-orange-400 font-bold text-xl border border-slate-700 shadow-[0_0_15px_rgba(251,146,60,0.2)]"
                >
                  {{ builderHistory.name.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <h2 class="text-2xl font-bold text-white">{{ builderHistory.name }}</h2>
                  <p class="text-sm text-slate-400 flex items-center gap-1">
                    <HashIcon class="w-3 h-3" /> ID: {{ builderHistory.builderId }}
                  </p>
                </div>
              </div>

              <!-- Mini Stats for Builder -->
              <div class="grid grid-cols-2 gap-3">
                <div
                  class="p-3 bg-slate-950/50 rounded-lg border border-slate-800 group hover:border-orange-500/30 transition-colors"
                >
                  <div class="text-xs text-slate-500 uppercase group-hover:text-orange-400/70">Data Points</div>
                  <div class="text-lg font-mono text-white">{{ builderHistory.items?.length || 0 }}</div>
                </div>
                <div
                  class="p-3 bg-slate-950/50 rounded-lg border border-slate-800 group hover:border-orange-500/30 transition-colors"
                >
                  <div class="text-xs text-slate-500 uppercase group-hover:text-orange-400/70">Latest Rank</div>
                  <div class="text-lg font-mono text-orange-400">#{{ builderHistory.items?.[0]?.rank || "-" }}</div>
                </div>
              </div>
            </div>

            <div class="md:w-2/3 h-[300px] bg-slate-950/30 rounded-xl border border-slate-800/50 p-4 relative">
              <p
                v-if="!builderHistory.items || !builderHistory.items.length"
                class="absolute inset-0 flex items-center justify-center text-slate-500"
              >
                No history data available. Senko is sad... 😿
              </p>
              <Line v-else :data="chartData" :options="chartOptions" />
            </div>
          </div>
        </section>

        <!-- Main Table -->
        <div
          class="bg-slate-900/50 border border-slate-800 rounded-xl shadow-xl backdrop-blur-sm overflow-hidden flex flex-col"
        >
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 class="font-bold text-slate-200 flex items-center gap-2">
              <TrophyIcon class="w-5 h-5 text-yellow-400" />
              Leaderboard
            </h3>
            <div class="text-xs text-slate-500">Showing {{ aggregateItems.length }} builders</div>
          </div>

          <div v-if="!isLoading && aggregateItems.length === 0" class="p-12 text-center text-slate-500">
            <GhostIcon class="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No data found. Have some fried tofu instead. 🍙</p>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-950/50 text-slate-400 font-medium uppercase text-xs tracking-wider">
                <tr>
                  <th class="px-6 py-4" title="Pozycja na tej liście na podstawie Total Points (1 = najwyżej)">Rank</th>
                  <th class="px-6 py-4" title="Nazwa gracza / budowniczego">Builder</th>
                  <th
                    class="px-6 py-4 text-right"
                    title="Suma punktów ze wszystkich snapshotów uwzględnionych w tym widoku"
                  >
                    Total Points
                  </th>
                  <th
                    class="px-6 py-4 text-right"
                    title="Średnia pozycja w rankingu gry (rank_position) z snapshotów w wybranym okresie"
                  >
                    Avg. Position
                  </th>
                  <th
                    class="px-6 py-4 text-right"
                    title="Liczba snapshotów / wpisów użytych do wyliczenia statystyk dla gracza"
                  >
                    Entries
                  </th>
                  <th class="px-6 py-4 text-center" title="Pokaż szczegółową historię punktów dla tego gracza">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/50">
                <tr
                  v-for="(row, index) in aggregateItems"
                  :key="row.builderId ?? index"
                  class="hover:bg-slate-800/30 transition-colors group"
                  :class="{ 'bg-orange-900/10': builderHistory.builderId === row.builderId }"
                >
                  <td class="px-6 py-4 font-mono text-slate-500">#{{ index + 1 }}</td>
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      <div
                        class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-700 group-hover:border-orange-500/50 group-hover:text-orange-400 transition-colors"
                      >
                        {{ row.name?.charAt(0).toUpperCase() }}
                      </div>
                      <span class="font-medium text-slate-200 group-hover:text-white transition-colors">{{
                        row.name
                      }}</span>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right font-mono text-orange-400 font-medium">
                    {{ row.totalPoints?.toLocaleString() }}
                  </td>
                  <td class="px-6 py-4 text-right font-mono text-slate-400">
                    {{ row.averageRank?.toFixed ? row.averageRank.toFixed(2) : row.averageRank }}
                  </td>
                  <td class="px-6 py-4 text-right text-slate-500">
                    {{ row.entriesCount }}
                  </td>
                  <td class="px-6 py-4 text-center">
                    <button
                      @click="onShowHistory(row)"
                      class="p-2 rounded-lg hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 transition-colors"
                      title="View History"
                    >
                      <LineChartIcon class="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- SNAPSHOT VIEW -->
      <template v-else>
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-280px)] min-h-[500px]">
          <!-- Sidebar List -->
          <aside class="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div class="p-4 border-b border-slate-800 bg-slate-950/30">
              <h3 class="font-bold text-slate-200">Snapshots</h3>
              <p class="text-xs text-slate-500 mt-1">Select a timestamp to view rank</p>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              <p v-if="!isLoading && snapshots.length === 0" class="p-4 text-center text-slate-500 text-sm">
                No snapshots found.
              </p>
              <button
                v-for="s in snapshots"
                :key="s.snapshotId"
                @click="onSelectSnapshot(s.snapshotId)"
                class="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between group transition-all"
                :class="
                  s.snapshotId === selectedSnapshotId
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                "
              >
                <span class="font-mono text-xs">{{ formatSnapshotDate(s.capturedAt) }}</span>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-500 group-hover:border-slate-700"
                  >{{ s.entries?.length ?? 0 }}</span
                >
              </button>
            </div>
          </aside>

          <!-- Snapshot Content -->
          <div
            class="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col relative"
          >
            <div v-if="!selectedSnapshot" class="absolute inset-0 flex items-center justify-center text-slate-500">
              Select a snapshot from the list
            </div>
            <template v-else>
              <div class="p-4 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-slate-200">
                    Rankings @ {{ formatSnapshotDate(selectedSnapshot.capturedAt) }}
                  </h3>
                  <p class="text-xs text-slate-500">Total entries: {{ selectedSnapshot.entries?.length }}</p>
                </div>
              </div>
              <div class="flex-1 overflow-y-auto custom-scrollbar">
                <table class="w-full text-left text-sm">
                  <thead
                    class="sticky top-0 bg-slate-950 text-slate-400 font-medium uppercase text-xs tracking-wider z-10"
                  >
                    <tr>
                      <th class="px-6 py-3 border-b border-slate-800">Rank</th>
                      <th class="px-6 py-3 border-b border-slate-800">Player</th>
                      <th class="px-6 py-3 border-b border-slate-800 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/50">
                    <tr
                      v-for="(entry, index) in selectedSnapshot.entries"
                      :key="index"
                      class="hover:bg-slate-800/30 transition-colors"
                    >
                      <td class="px-6 py-3 font-mono text-slate-500 w-20">#{{ entry.rank }}</td>
                      <td class="px-6 py-3 font-medium text-slate-300">{{ entry.name }}</td>
                      <td class="px-6 py-3 text-right font-mono text-orange-400">
                        {{ entry.points?.toLocaleString() }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
      </template>
    </main>

    <footer class="border-t border-slate-900 bg-slate-950 py-8 mt-auto">
      <div class="container mx-auto px-4 text-center">
        <p class="text-slate-400 text-sm">
          &copy; 2025 VER - Verified Erection Report ||
          <span class="text-xs text-slate-400 mt-2 inline-block">
            Made with <span class="text-red-500">❤️</span> by
            <a
              href="https://github.com/p0tfur"
              target="_blank"
              class="text-orange-500/80 hover:text-orange-500 transition-colors"
              >p0tfur</a
            >
          </span>
          <br />
          <a
            href="https://24na7.info/eclesiar-scripts/"
            target="_blank"
            class="text-orange-500/80 hover:text-orange-500 transition-colors"
            >Tampermonkey Scripts for Eclesiar</a
          >
          |
          <a
            href="https://handytoolbox-front.pages.dev/eclesiar/tools/eclesiar-dmg"
            target="_blank"
            class="text-orange-500/80 hover:text-orange-500 transition-colors"
            >Damage Calculator for Eclesiar</a
          >
          |
          <a
            href="https://lifedots.app/"
            target="_blank"
            class="text-orange-500/80 hover:text-orange-500 transition-colors"
            >Visualize Your Life Timeline
          </a>
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { getBuildings, getRankings, getBuilderHistory } from "./api/api.js";
import {
  FlameIcon,
  BuildingIcon,
  ChevronDownIcon,
  CalendarIcon,
  BarChart3Icon,
  CameraIcon,
  DownloadIcon,
  AlertCircleIcon,
  TrophyIcon,
  GhostIcon,
  LineChartIcon,
  HashIcon,
  CheckIcon,
  XIcon,
} from "lucide-vue-next";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "vue-chartjs";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// --- STATE ---
const buildings = ref<any[]>([]);
// Multiselect: empty array = all buildings (Global View), array with IDs = selected buildings
const selectedBuildingIds = ref<number[]>([]);
const isMultiselectOpen = ref(false);
const multiselectTriggerRef = ref<HTMLElement | null>(null);
const dropdownPosition = ref({ top: 0, left: 0, width: 0 });
const dateFrom = ref<string>("");
const dateTo = ref<string>("");
const rangeDays = ref<number>(7);
const mode = ref<"aggregate" | "snapshot">("aggregate");
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const aggregateItems = ref<any[]>([]);
const snapshots = ref<any[]>([]);
const selectedSnapshotId = ref<number | null>(null);
const usedBuildingIds = ref<number[]>([]);

const builderHistory = ref<{ builderId: number | null; name: string; items: any[] }>({
  builderId: null,
  name: "",
  items: [],
});

// --- COMPUTED ---
const canLoad = computed(() => !!dateFrom.value && !!dateTo.value);

const selectedSnapshot = computed(() => {
  if (!selectedSnapshotId.value) return null;
  return snapshots.value.find((s) => s.snapshotId === selectedSnapshotId.value) ?? null;
});

const totalBuildingPoints = computed(() => {
  const activeSet =
    usedBuildingIds.value && usedBuildingIds.value.length ? new Set<number>(usedBuildingIds.value) : null;

  const uniqueLevels = new Map<number, number>();
  for (const b of buildings.value) {
    const id = Number((b as any).id);
    if (!Number.isFinite(id)) continue;
    if (activeSet && !activeSet.has(id)) continue;
    if (uniqueLevels.has(id)) continue;
    const level = Number((b as any).level) || 0;
    uniqueLevels.set(id, level);
  }

  let sum = 0;
  uniqueLevels.forEach((level) => {
    sum += level;
  });
  return sum;
});

const completedRewards = computed(() => {
  if (totalBuildingPoints.value <= 0) return 0;
  return Math.floor(totalBuildingPoints.value / 12);
});

const pointsToNextReward = computed(() => {
  if (totalBuildingPoints.value === 0) return 12;
  const remainder = totalBuildingPoints.value % 12;
  if (remainder === 0) return 0;
  return 12 - remainder;
});

const rangeOptions = computed(() => {
  const base = [1, 2, 3, 5, 7, 10, 30];
  if (!base.includes(rangeDays.value)) {
    base.push(rangeDays.value);
  }
  return base.sort((a, b) => a - b);
});

// Multiselect display text
const multiselectDisplayText = computed(() => {
  if (selectedBuildingIds.value.length === 0) {
    return "All Sites / Global View";
  }
  if (selectedBuildingIds.value.length === 1) {
    const building = buildings.value.find((b: any) => b.id === selectedBuildingIds.value[0]);
    if (building) {
      return formatBuildingOption(building);
    }
    return "1 site selected";
  }
  return `${selectedBuildingIds.value.length} sites selected`;
});

// Dropdown style for fixed positioning
const dropdownStyle = computed(() => ({
  top: `${dropdownPosition.value.top}px`,
  left: `${dropdownPosition.value.left}px`,
  width: `${dropdownPosition.value.width}px`,
  zIndex: 9999,
}));

// Chart Configuration
const chartData = computed(() => {
  if (!builderHistory.value.items || builderHistory.value.items.length === 0) {
    return { labels: [], datasets: [] };
  }

  // Sort by date ascending
  const sorted = [...builderHistory.value.items].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  const labels = sorted.map((item) => new Date(item.capturedAt).toLocaleDateString());
  const dataPoints = sorted.map((item) => item.points);

  return {
    labels,
    datasets: [
      {
        label: "Points",
        // Senko Orange Theme for Chart
        backgroundColor: "rgba(251, 146, 60, 0.1)", // orange-400 with opacity
        borderColor: "#fb923c", // orange-400
        pointBackgroundColor: "#020617",
        pointBorderColor: "#fb923c",
        pointHoverBackgroundColor: "#fb923c",
        pointHoverBorderColor: "#fff",
        data: dataPoints,
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: "#0f172a",
      titleColor: "#94a3b8",
      bodyColor: "#e2e8f0",
      borderColor: "#fb923c", // orange border on tooltip
      borderWidth: 1,
      padding: 10,
      displayColors: false,
      callbacks: {
        label: function (context: any) {
          return `Points: ${context.parsed.y}`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: "#1e293b",
        display: false,
      },
      ticks: {
        color: "#64748b",
        font: { size: 10 },
      },
    },
    y: {
      grid: {
        color: "#1e293b",
      },
      ticks: {
        color: "#64748b",
        font: { size: 10 },
      },
    },
  },
};

// --- METHODS ---
function formatBuildingOption(building: any): string {
  const region = building?.region ? String(building.region) : "Unknown region";
  const type = building?.type ? String(building.type) : "Unknown type";
  const level = building?.level ?? "?";
  const base = `${region} – ${type} (LVL ${level})`;

  if (!building?.lastCapturedAt) {
    return `${base} (no snapshot data)`;
  }

  const last = new Date(building.lastCapturedAt);
  if (Number.isNaN(last.getTime())) {
    return `${base} (no snapshot data)`;
  }

  return `${base} (${last.toLocaleString()})`;
}

function initDefaultDates() {
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays.value * 24 * 60 * 60 * 1000);
  dateTo.value = to.toISOString().slice(0, 10);
  dateFrom.value = from.toISOString().slice(0, 10);
}

async function loadBuildings() {
  try {
    errorMessage.value = null;
    const params: Record<string, unknown> = {};
    if (dateFrom.value) params.from = new Date(dateFrom.value).toISOString();
    if (dateTo.value) params.to = new Date(dateTo.value).toISOString();

    const result = await getBuildings(params);
    buildings.value = Array.isArray(result.items) ? result.items : [];
  } catch (err) {
    console.error("[VER] Failed to load buildings", err);
    errorMessage.value = "Could not load project sites.";
  }
}

async function loadRankings() {
  if (!canLoad.value) return;

  // Snapshot mode requires exactly one building selected
  if (mode.value === "snapshot" && selectedBuildingIds.value.length !== 1) {
    errorMessage.value = "Please select exactly one building for Snapshot mode.";
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;
  aggregateItems.value = [];
  snapshots.value = [];
  selectedSnapshotId.value = null;

  // Reset history when reloading main data to avoid confusion
  // builderHistory.value = { builderId: null, name: "", items: [] };

  try {
    const params: Record<string, unknown> = { mode: mode.value };

    if (dateFrom.value) params.from = new Date(dateFrom.value).toISOString();
    if (dateTo.value) params.to = new Date(dateTo.value).toISOString();

    if (mode.value === "snapshot") {
      // Snapshot mode - single building only
      params.buildingId = selectedBuildingIds.value[0];
    } else if (mode.value === "aggregate") {
      if (selectedBuildingIds.value.length === 1) {
        // Single building selected
        params.buildingId = selectedBuildingIds.value[0];
      } else if (selectedBuildingIds.value.length > 1) {
        // Multiple buildings selected - send as comma-separated list
        params.buildingIds = selectedBuildingIds.value.join(",");
      } else if (rangeDays.value) {
        // No buildings selected (Global View) - use limit
        params.limitBuildings = rangeDays.value;
      }
    }

    const result = await getRankings(params);

    if (mode.value === "aggregate") {
      if (Array.isArray(result.items)) aggregateItems.value = result.items;

      if (selectedBuildingIds.value.length > 0) {
        usedBuildingIds.value = [...selectedBuildingIds.value];
      } else if (Array.isArray(result.usedBuildingIds)) {
        usedBuildingIds.value = result.usedBuildingIds
          .map((id: any) => Number(id))
          .filter((id: number) => Number.isFinite(id));
      } else {
        usedBuildingIds.value = [];
      }
    } else {
      usedBuildingIds.value = [];
      if (Array.isArray(result.snapshots)) {
        snapshots.value = result.snapshots;
        if (snapshots.value.length > 0) {
          selectedSnapshotId.value = snapshots.value[0].snapshotId ?? null;
        }
      }
    }
  } catch (err) {
    console.error("[VER] Failed to load rankings", err);
    errorMessage.value = "Failed to load rankings data.";
  } finally {
    isLoading.value = false;
  }
}

function onSelectSnapshot(id: number) {
  selectedSnapshotId.value = id;
}

function formatSnapshotDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function exportAggregateCsv() {
  if (mode.value !== "aggregate" || !aggregateItems.value.length) return;

  const header = ["Miejsce", "Nick", "Ilość punktów"];
  const separator = ";";
  const rows: string[] = [];
  rows.push(header.join(separator));

  aggregateItems.value.forEach((row: any, index: number) => {
    const values = [index + 1, row.name ?? "", row.totalPoints ?? ""].map((v) => {
      const text = String(v ?? "");
      const escaped = text.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    rows.push(values.join(separator));
  });

  const csvContent = rows.join("\r\n");
  const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  let buildingPart = "all-sites";

  // Generate filename based on selected buildings
  if (selectedBuildingIds.value.length === 1) {
    // Single building selected
    const selectedBuilding = buildings.value.find((b: any) => b.id === selectedBuildingIds.value[0]);
    if (selectedBuilding) {
      const regionSafe = String(selectedBuilding.region ?? "").replace(/\s+/g, "_");
      const typeSafe = String(selectedBuilding.type ?? "").replace(/\s+/g, "_");
      const levelSafe =
        selectedBuilding.level !== undefined && selectedBuilding.level !== null
          ? `LVL${String(selectedBuilding.level)}`
          : "";
      buildingPart = [regionSafe, typeSafe, levelSafe].filter(Boolean).join("-");
    }
  } else if (selectedBuildingIds.value.length > 1) {
    // Multiple buildings selected
    buildingPart = `${selectedBuildingIds.value.length}-sites`;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;

  const nameParts = [buildingPart, timestamp].filter(Boolean);

  a.href = url;
  a.download = `${nameParts.join("-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function onShowHistory(row: any) {
  if (!row || !row.builderId) return;

  // Scroll to top to see the chart
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    errorMessage.value = null;
    builderHistory.value = {
      builderId: row.builderId,
      name: row.name,
      items: [],
    };

    const params: Record<string, unknown> = {};
    // For builder history, use first selected building if any
    if (selectedBuildingIds.value.length === 1) {
      params.buildingId = selectedBuildingIds.value[0];
    }
    if (dateFrom.value) params.from = new Date(dateFrom.value).toISOString();
    if (dateTo.value) params.to = new Date(dateTo.value).toISOString();

    const result = await getBuilderHistory(row.builderId, params);
    builderHistory.value = {
      builderId: row.builderId,
      name: result.builderName ?? row.name,
      items: Array.isArray(result.points) ? result.points : [],
    };
  } catch (err) {
    console.error("[VER] Failed to load builder history", err);
    errorMessage.value = "Failed to load builder history.";
  }
}

// --- WATCHERS & LIFECYCLE ---
watch(
  [selectedBuildingIds, dateFrom, dateTo, mode],
  () => {
    if (canLoad.value) loadRankings();
  },
  { deep: true }
);

watch(rangeDays, () => {
  if (canLoad.value && mode.value === "aggregate") {
    loadRankings();
  }
});

function adjustRangeDays(delta: number) {
  const next = rangeDays.value + delta;
  if (next < 1) return;
  rangeDays.value = next;
}

function incrementRangeDays() {
  adjustRangeDays(1);
}

function decrementRangeDays() {
  adjustRangeDays(-1);
}

// --- MULTISELECT FUNCTIONS ---
function toggleMultiselect(event: MouseEvent) {
  // Calculate position based on trigger button
  const trigger = event.currentTarget as HTMLElement;
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    dropdownPosition.value = {
      top: rect.bottom + 4, // 4px gap
      left: rect.left,
      width: rect.width,
    };
  }
  isMultiselectOpen.value = !isMultiselectOpen.value;
}

function selectAllBuildings() {
  // Clear selection = All Sites / Global View
  selectedBuildingIds.value = [];
  isMultiselectOpen.value = false;
}

function toggleBuildingSelection(buildingId: number) {
  const index = selectedBuildingIds.value.indexOf(buildingId);
  if (index === -1) {
    // Add to selection
    selectedBuildingIds.value = [...selectedBuildingIds.value, buildingId];
  } else {
    // Remove from selection
    selectedBuildingIds.value = selectedBuildingIds.value.filter((id) => id !== buildingId);
  }
}

// Close multiselect when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // Check if click is inside the trigger area or the teleported dropdown
  const isInsideTrigger = target.closest(".md\\:col-span-3.relative.group");
  const isInsideDropdown = target.closest("[data-multiselect-dropdown]");
  if (!isInsideTrigger && !isInsideDropdown) {
    isMultiselectOpen.value = false;
  }
}

// --- LIFECYCLE ---
onMounted(() => {
  initDefaultDates();
  loadBuildings();
  // Add click outside listener for multiselect
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
/* Custom scrollbar for internal containers */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #0f172a;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #475569;
}
</style>
