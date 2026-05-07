import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

const PRIZE_RULES_START = new Date("2026-05-05T00:00:00");
const PRIZE_POOL_BY_LEVEL: Record<number, number> = {
  1: 45,
  2: 70,
  3: 135,
  4: 200,
  5: 320,
};
const PRIZE_EXCLUDED_BUILDING_SLUG = "gdansk-hospital-lvl-5";
const PRIZE_EXCLUDED_BUILDING_CREATED_AT = "2026-05-05 16:06:49";

type QueryExecutor = Pool | PoolConnection;

interface SnapshotPrizeMeta {
  snapshotId: number;
  capturedAt: Date | string;
  buildingLevel: number;
  buildingSlug: string | null;
  buildingCreatedAt: Date | string | null;
}

interface SnapshotPrizeEntry {
  id: number;
  snapshotId: number;
  rankPosition: number;
  points: number;
  prizeAmount: number | null;
}

function parseDateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSqlDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function shouldExcludePrizeForBuilding(slug: string | null, createdAt: Date | string | null): boolean {
  if (!slug || slug !== PRIZE_EXCLUDED_BUILDING_SLUG) {
    return false;
  }

  const parsedCreatedAt = parseDateValue(createdAt);
  if (!parsedCreatedAt) {
    return false;
  }

  return formatSqlDateTime(parsedCreatedAt) === PRIZE_EXCLUDED_BUILDING_CREATED_AT;
}

function buildPrizeAmounts(entries: SnapshotPrizeEntry[], prizePool: number, buildingLevel: number): Map<number, number> {
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.rankPosition !== b.rankPosition) {
      return a.rankPosition - b.rankPosition;
    }
    return a.id - b.id;
  });

  const totalPoints = sortedEntries.reduce((sum, entry) => sum + entry.points, 0);
  const amounts = new Map<number, number>();

  for (const entry of sortedEntries) {
    amounts.set(entry.id, 0);
  }

  if (totalPoints <= 0) {
    return amounts;
  }

  const eligibleCount = buildingLevel >= 4 ? 20 : 10;
  const eligibleEntries = sortedEntries.slice(0, eligibleCount);
  const rewardedEntries = eligibleEntries.slice(1);

  if (rewardedEntries.length === 0) {
    return amounts;
  }

  const excludedEntries = sortedEntries.filter((_entry, index) => index === 0 || index >= eligibleEntries.length);
  const excludedPool = excludedEntries.reduce((sum, entry) => sum + (entry.points / totalPoints) * prizePool, 0);
  const redistributedExcludedShare = excludedPool / rewardedEntries.length;

  let roundedPrizeSum = 0;
  for (const entry of rewardedEntries) {
    const baseShare = (entry.points / totalPoints) * prizePool;
    const roundedAmount = roundCurrency(baseShare + redistributedExcludedShare);
    amounts.set(entry.id, roundedAmount);
    roundedPrizeSum += roundedAmount;
  }

  const correction = roundCurrency(prizePool - roundedPrizeSum);
  if (correction !== 0) {
    const lastRewardedEntry = rewardedEntries[rewardedEntries.length - 1];
    amounts.set(lastRewardedEntry.id, roundCurrency((amounts.get(lastRewardedEntry.id) ?? 0) + correction));
  }

  return amounts;
}

export async function syncSnapshotPrizeAmounts(db: QueryExecutor, snapshotIds: number[]): Promise<void> {
  const uniqueSnapshotIds = Array.from(
    new Set(snapshotIds.map((snapshotId) => Number(snapshotId)).filter((snapshotId) => Number.isFinite(snapshotId) && snapshotId > 0))
  );

  if (uniqueSnapshotIds.length === 0) {
    return;
  }

  const placeholders = uniqueSnapshotIds.map(() => "?").join(",");

  const [snapshotRows] = await db.execute<RowDataPacket[]>(
    `SELECT s.id AS snapshotId,
            s.captured_at AS capturedAt,
            b.level AS buildingLevel,
            b.slug AS buildingSlug,
            b.created_at AS buildingCreatedAt
     FROM ranking_snapshots s
     JOIN buildings b ON b.id = s.building_id
     WHERE s.id IN (${placeholders})`,
    uniqueSnapshotIds
  );

  const [entryRows] = await db.execute<RowDataPacket[]>(
    `SELECT id,
            snapshot_id AS snapshotId,
            rank_position AS rankPosition,
            points,
            prize_amount AS prizeAmount
     FROM ranking_entries
     WHERE snapshot_id IN (${placeholders})
     ORDER BY snapshot_id ASC, rank_position ASC, id ASC`,
    uniqueSnapshotIds
  );

  const entriesBySnapshot = new Map<number, SnapshotPrizeEntry[]>();
  for (const row of entryRows) {
    const snapshotId = Number(row.snapshotId);
    if (!entriesBySnapshot.has(snapshotId)) {
      entriesBySnapshot.set(snapshotId, []);
    }

    entriesBySnapshot.get(snapshotId)!.push({
      id: Number(row.id),
      snapshotId,
      rankPosition: Number(row.rankPosition) || 0,
      points: Number(row.points) || 0,
      prizeAmount: row.prizeAmount == null ? null : Number(row.prizeAmount),
    });
  }

  for (const row of snapshotRows) {
    const meta: SnapshotPrizeMeta = {
      snapshotId: Number(row.snapshotId),
      capturedAt: row.capturedAt as Date | string,
      buildingLevel: Number(row.buildingLevel) || 0,
      buildingSlug: row.buildingSlug == null ? null : String(row.buildingSlug),
      buildingCreatedAt: row.buildingCreatedAt as Date | string | null,
    };

    const snapshotEntries = entriesBySnapshot.get(meta.snapshotId) ?? [];
    if (snapshotEntries.length === 0) {
      continue;
    }

    const capturedAt = parseDateValue(meta.capturedAt);
    const prizePool = PRIZE_POOL_BY_LEVEL[meta.buildingLevel];
    const isPrizeEligible =
      !!capturedAt &&
      capturedAt >= PRIZE_RULES_START &&
      !!prizePool &&
      !shouldExcludePrizeForBuilding(meta.buildingSlug, meta.buildingCreatedAt);

    if (!isPrizeEligible) {
      await db.execute("UPDATE ranking_entries SET prize_amount = NULL WHERE snapshot_id = ?", [meta.snapshotId]);
      continue;
    }

    const prizeAmounts = buildPrizeAmounts(snapshotEntries, prizePool, meta.buildingLevel);
    const hasChanges = snapshotEntries.some((entry) => {
      const targetAmount = prizeAmounts.get(entry.id) ?? 0;
      return entry.prizeAmount == null || Math.abs(entry.prizeAmount - targetAmount) > 0.0001;
    });

    if (!hasChanges) {
      continue;
    }

    const caseClauses: string[] = [];
    const params: Array<number> = [];
    const entryIds: number[] = [];

    for (const entry of snapshotEntries) {
      caseClauses.push("WHEN ? THEN ?");
      params.push(entry.id, prizeAmounts.get(entry.id) ?? 0);
      entryIds.push(entry.id);
    }

    const inPlaceholders = entryIds.map(() => "?").join(",");

    await db.execute(
      `UPDATE ranking_entries
       SET prize_amount = CASE id ${caseClauses.join(" ")} ELSE prize_amount END
       WHERE id IN (${inPlaceholders})`,
      [...params, ...entryIds]
    );
  }
}
