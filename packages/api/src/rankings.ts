import crypto from "crypto";
import type { Request, Response } from "express";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./db";

interface SnapshotBuildingPayload {
  region: string;
  type: string;
  level: number | string;
}

interface SnapshotDonorPayload {
  rank: number | string;
  player: string;
  points: string | number;
}

interface SnapshotPayload {
  source?: string;
  capturedAt?: string;
  pageUrl?: string;
  clientUserAgent?: string;
  building?: SnapshotBuildingPayload;
  donors?: SnapshotDonorPayload[];
}

interface NormalisedBuilding {
  region: string;
  type: string;
  level: number;
}

const BUILDING_TYPE_SYNONYMS: Record<string, string> = {
  szpital: "Hospital",
  hospital: "Hospital",
  "strefa przemysłowa": "Industrial zone",
  "industrial zone": "Industrial zone",
  "pole produkcyjne": "Production fields",
  "production fields": "Production fields",
  "baza wojskowa": "Military base",
  "military base": "Military base",
};

function normaliseBuildingType(rawType: string): string {
  const normalizedKey = rawType.trim().toLowerCase();
  const canonical = BUILDING_TYPE_SYNONYMS[normalizedKey];
  if (canonical) {
    return canonical;
  }
  return rawType.trim();
}

interface NormalisedDonor {
  rank: number;
  player: string;
  points: number;
}

function normaliseBuilding(raw?: SnapshotBuildingPayload): NormalisedBuilding {
  if (!raw) {
    throw new Error("Missing building in payload");
  }
  const region = String(raw.region ?? "").trim();
  const rawType = String(raw.type ?? "");
  const type = normaliseBuildingType(rawType);
  const levelNum = parseInt(String(raw.level ?? "0"), 10) || 0;
  if (!region || !type || !levelNum) {
    throw new Error("Invalid building data");
  }
  return { region, type, level: levelNum };
}

function normaliseDonors(rawList?: SnapshotDonorPayload[]): NormalisedDonor[] {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error("Donors list is empty");
  }

  const donors: NormalisedDonor[] = [];

  for (const raw of rawList) {
    if (!raw) continue;
    const player = String(raw.player ?? "").trim();
    if (!player) continue;
    const rank = parseInt(String(raw.rank ?? "0"), 10) || 0;
    const points = parsePoints(raw.points);
    donors.push({ rank, player, points });
  }

  if (donors.length === 0) {
    throw new Error("No valid donors in payload");
  }

  donors.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.player.localeCompare(b.player);
  });

  return donors;
}

function parsePoints(value: string | number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  // Założenie: kropka jest separatorem dziesiętnym.
  // Przecinki traktujemy jako separatory tysięcy i usuwamy,
  // chyba że nie ma kropki, wtedy przecinek zamieniamy na kropkę.
  let normalized = raw.replace(/\s+/g, "");

  if (normalized.includes(".")) {
    // Format typu 14,310.961 lub 14310.961 – usuwamy przecinki.
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    // Format typu 14310,961 – przecinek jako separator dziesiętny.
    normalized = normalized.replace(/\./g, "");
    normalized = normalized.replace(",", ".");
  }

  // Zostaw tylko cyfry i kropkę.
  normalized = normalized.replace(/[^0-9.]/g, "");
  if (!normalized) return 0;

  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function computePayloadHash(building: NormalisedBuilding, donors: NormalisedDonor[]): string {
  const canonical = {
    building,
    donors: donors.map((d) => ({ rank: d.rank, player: d.player, points: d.points })),
  };
  const json = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(json).digest("hex");
}

async function ensureBuilding(conn: PoolConnection, building: NormalisedBuilding): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    "SELECT id FROM buildings WHERE region = ? AND building_type = ? AND level = ? LIMIT 1",
    [building.region, building.type, building.level]
  );

  if (rows.length > 0) {
    return Number(rows[0].id);
  }

  const slug = `${building.region}-${building.type}-lvl-${building.level}`.toLowerCase();

  const [result] = await conn.execute<ResultSetHeader>(
    "INSERT INTO buildings (region, building_type, level, slug) VALUES (?, ?, ?, ?)",
    [building.region, building.type, building.level, slug]
  );

  return Number(result.insertId);
}

async function ensureBuilder(conn: PoolConnection, name: string): Promise<number> {
  const trimmed = name.trim();
  const [rows] = await conn.execute<RowDataPacket[]>("SELECT id FROM builders WHERE name = ? LIMIT 1", [trimmed]);
  if (rows.length > 0) {
    return Number(rows[0].id);
  }

  const [result] = await conn.execute<ResultSetHeader>("INSERT INTO builders (name) VALUES (?)", [trimmed]);
  return Number(result.insertId);
}

async function findRecentSnapshotWithHash(
  conn: PoolConnection,
  buildingId: number,
  payloadHash: string
): Promise<number | null> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    "SELECT id, payload_hash FROM ranking_snapshots WHERE building_id = ? AND captured_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) ORDER BY captured_at DESC LIMIT 1",
    [buildingId]
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  if (String(row.payload_hash) === payloadHash) {
    return Number(row.id);
  }
  return null;
}

export async function handlePostSnapshot(req: Request, res: Response): Promise<void> {
  let payload: SnapshotPayload;

  try {
    payload = req.body as SnapshotPayload;
  } catch (_err) {
    res.status(400).json({ status: "error", message: "Invalid JSON body" });
    return;
  }

  let conn: PoolConnection | null = null;

  try {
    const building = normaliseBuilding(payload.building);
    const donors = normaliseDonors(payload.donors);
    const payloadHash = computePayloadHash(building, donors);

    const apiKeyUsedHeader = req.headers["x-ver-api-key"];
    const apiKeyUsed = apiKeyUsedHeader ? String(apiKeyUsedHeader).trim() || null : null;

    const pool = getPool();
    conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const buildingId = await ensureBuilding(conn, building);

      const existingSnapshotId = await findRecentSnapshotWithHash(conn, buildingId, payloadHash);
      if (existingSnapshotId !== null) {
        await conn.rollback();
        res.json({ status: "duplicate", snapshotId: existingSnapshotId });
        conn.release();
        return;
      }

      const capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : new Date();
      const source = payload.source || "eclesiar-userscript";
      const clientUserAgent = payload.clientUserAgent || req.headers["user-agent"] || "";
      const pageUrl = payload.pageUrl || "";

      const [snapshotResult] = await conn.execute<ResultSetHeader>(
        "INSERT INTO ranking_snapshots (building_id, captured_at, source, client_user_agent, page_url, payload_hash, api_key_used) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [buildingId, capturedAt, source, clientUserAgent, pageUrl, payloadHash, apiKeyUsed]
      );

      const snapshotId = Number(snapshotResult.insertId);

      let insertedEntries = 0;

      for (const donor of donors) {
        const builderId = await ensureBuilder(conn, donor.player);
        await conn.execute<ResultSetHeader>(
          "INSERT INTO ranking_entries (snapshot_id, builder_id, rank_position, points) VALUES (?, ?, ?, ?)",
          [snapshotId, builderId, donor.rank, donor.points]
        );
        insertedEntries += 1;
      }

      await conn.commit();

      res.json({ status: "ok", snapshotId, insertedEntries });
    } catch (err) {
      console.error("[VER] Failed to save snapshot", err);
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          console.error("[VER] Failed to rollback", err);
        }
      }
      res.status(500).json({ status: "error", message: "Failed to save snapshot" });
    }
  } catch (err) {
    console.error("[VER] Failed to save snapshot", err);
    res.status(400).json({ status: "error", message: err instanceof Error ? err.message : "Invalid payload" });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (err) {
        console.error("[VER] Failed to release connection", err);
        // ignore release failure
      }
    }
  }
}

export async function handleGetBuildings(req: Request, res: Response): Promise<void> {
  try {
    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;

    const now = new Date();

    const makeStartOfDay = (d: Date) => {
      const copy = new Date(d.getTime());
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const makeEndOfDay = (d: Date) => {
      const copy = new Date(d.getTime());
      copy.setHours(23, 59, 59, 999);
      return copy;
    };

    const hasDateFilter = !!fromRaw || !!toRaw;

    const toBase = toRaw ? new Date(toRaw) : now;
    const to = makeEndOfDay(toBase);

    const fromBase = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const from = makeStartOfDay(fromBase);

    const pool = getPool();

    if (!hasDateFilter) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, region, building_type AS type, level FROM buildings ORDER BY region, building_type, level"
      );

      res.json({ items: rows });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT DISTINCT b.id, b.region, b.building_type AS type, b.level FROM buildings b JOIN ranking_snapshots s ON s.building_id = b.id WHERE s.captured_at BETWEEN ? AND ? ORDER BY b.region, b.building_type, b.level",
      [from, to]
    );

    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Failed to load buildings" });
  }
}

export async function handleGetRankings(req: Request, res: Response): Promise<void> {
  const buildingIdRaw = req.query.buildingId;
  const modeRaw = req.query.mode;
  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  const limitBuildingsRaw = req.query.limitBuildings as string | undefined;

  const buildingId = parseInt(String(buildingIdRaw ?? "0"), 10) || 0;
  const hasBuildingFilter = !!buildingId;

  const mode = String(modeRaw || "aggregate");

  const now = new Date();

  const makeStartOfDay = (d: Date) => {
    const copy = new Date(d.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const makeEndOfDay = (d: Date) => {
    const copy = new Date(d.getTime());
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  const toBase = toRaw ? new Date(toRaw) : now;
  const to = makeEndOfDay(toBase);

  const fromBase = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = makeStartOfDay(fromBase);

  const limitBuildings = limitBuildingsRaw ? parseInt(limitBuildingsRaw, 10) || 0 : 0;

  try {
    const pool = getPool();

    if (mode === "snapshot") {
      if (!hasBuildingFilter) {
        res.status(400).json({ status: "error", message: "buildingId is required for snapshot mode" });
        return;
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT s.id AS snapshotId, s.captured_at AS capturedAt, b.name, e.rank_position AS `rank`, e.points FROM ranking_snapshots s JOIN ranking_entries e ON e.snapshot_id = s.id JOIN builders b ON b.id = e.builder_id WHERE s.building_id = ? AND s.captured_at BETWEEN ? AND ? ORDER BY s.captured_at DESC, e.rank_position ASC",
        [buildingId, from, to]
      );

      const snapshotsMap = new Map<number, { snapshotId: number; capturedAt: Date; entries: any[] }>();

      for (const row of rows) {
        const id = Number(row.snapshotId);
        if (!snapshotsMap.has(id)) {
          snapshotsMap.set(id, {
            snapshotId: id,
            capturedAt: row.capturedAt as Date,
            entries: [],
          });
        }
        snapshotsMap.get(id)!.entries.push({
          rank: row.rank,
          name: row.name,
          points: row.points,
        });
      }

      const snapshots = Array.from(snapshotsMap.values());

      res.json({ buildingId, from, to, snapshots });
      return;
    }

    // agregated
    if (hasBuildingFilter) {
      // latest snapshot for specific building (no date constraint)
      const [latestRows] = await pool.execute<RowDataPacket[]>(
        "SELECT id, captured_at AS capturedAt FROM ranking_snapshots WHERE building_id = ? ORDER BY captured_at DESC LIMIT 1",
        [buildingId]
      );

      if (latestRows.length === 0) {
        res.json({ buildingId, from, to, items: [] });
        return;
      }

      const latestSnapshotId = Number(latestRows[0].id);
      const latestCapturedAt = latestRows[0].capturedAt as Date;

      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT b.id AS builderId, b.name, e.points AS totalPoints, e.rank_position AS averageRank, 1 AS entriesCount FROM ranking_entries e JOIN builders b ON b.id = e.builder_id WHERE e.snapshot_id = ? ORDER BY totalPoints DESC",
        [latestSnapshotId]
      );

      res.json({ buildingId, from, to, latestSnapshotId, latestCapturedAt, items: rows });
      return;
    }

    // all buildings: one latest snapshot per building (no date constraint)
    let latestSnapshots: RowDataPacket[];
    if (limitBuildings > 0) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT s.id AS snapshotId, s.building_id AS buildingId, s.captured_at AS capturedAt FROM ranking_snapshots s JOIN (SELECT building_id, MAX(captured_at) AS maxCapturedAt FROM ranking_snapshots GROUP BY building_id) t ON t.building_id = s.building_id AND t.maxCapturedAt = s.captured_at ORDER BY s.captured_at DESC LIMIT ?",
        [limitBuildings]
      );
      latestSnapshots = rows;
    } else {
      const [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT s.id AS snapshotId, s.building_id AS buildingId, s.captured_at AS capturedAt FROM ranking_snapshots s JOIN (SELECT building_id, MAX(captured_at) AS maxCapturedAt FROM ranking_snapshots GROUP BY building_id) t ON t.building_id = s.building_id AND t.maxCapturedAt = s.captured_at",
        []
      );
      latestSnapshots = rows;
    }

    if (latestSnapshots.length === 0) {
      res.json({ buildingId: null, from, to, items: [], usedBuildingIds: [] });
      return;
    }

    const snapshotIds = latestSnapshots.map((row) => Number(row.snapshotId));
    const usedBuildingIds = Array.from(new Set(latestSnapshots.map((row) => Number(row.buildingId))));
    const placeholders = snapshotIds.map(() => "?").join(",");

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT b.id AS builderId, b.name, SUM(e.points) AS totalPoints, AVG(e.rank_position) AS averageRank, COUNT(*) AS entriesCount FROM ranking_entries e JOIN builders b ON b.id = e.builder_id WHERE e.snapshot_id IN (${placeholders}) GROUP BY b.id, b.name ORDER BY totalPoints DESC`,
      snapshotIds
    );

    res.json({ buildingId: null, from, to, items: rows, usedBuildingIds });
  } catch (err) {
    console.error("[VER] Failed to load rankings", err);
    res.status(500).json({ status: "error", message: "Failed to load rankings" });
  }
}

export async function handleGetBuilderHistory(req: Request, res: Response): Promise<void> {
  const builderIdRaw = req.params.id;
  const buildingIdRaw = req.query.buildingId;
  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;

  const builderId = parseInt(String(builderIdRaw ?? "0"), 10) || 0;
  const buildingId = buildingIdRaw ? parseInt(String(buildingIdRaw ?? "0"), 10) || 0 : 0;

  if (!builderId) {
    res.status(400).json({ status: "error", message: "builderId is required" });
    return;
  }

  const now = new Date();

  const makeStartOfDay = (d: Date) => {
    const copy = new Date(d.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const makeEndOfDay = (d: Date) => {
    const copy = new Date(d.getTime());
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  const toBase = toRaw ? new Date(toRaw) : now;
  const to = makeEndOfDay(toBase);

  const fromBase = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = makeStartOfDay(fromBase);

  try {
    const pool = getPool();

    const [builderRows] = await pool.execute<RowDataPacket[]>("SELECT id, name FROM builders WHERE id = ? LIMIT 1", [
      builderId,
    ]);

    if (builderRows.length === 0) {
      res.status(404).json({ status: "error", message: "Builder not found" });
      return;
    }

    const builder = builderRows[0];

    let rows: RowDataPacket[];

    if (buildingId) {
      // History for a specific building
      [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT s.id AS snapshotId, s.captured_at AS capturedAt, e.points, e.rank_position AS `rank`, b.id AS buildingId, b.region AS buildingRegion, b.building_type AS buildingType, b.level AS buildingLevel FROM ranking_entries e JOIN ranking_snapshots s ON s.id = e.snapshot_id JOIN buildings b ON b.id = s.building_id WHERE e.builder_id = ? AND s.building_id = ? AND s.captured_at BETWEEN ? AND ? ORDER BY s.captured_at ASC",
        [builderId, buildingId, from, to]
      );
    } else {
      // History for all buildings where the player participated in the given period
      [rows] = await pool.execute<RowDataPacket[]>(
        "SELECT s.id AS snapshotId, s.captured_at AS capturedAt, e.points, e.rank_position AS `rank`, b.id AS buildingId, b.region AS buildingRegion, b.building_type AS buildingType, b.level AS buildingLevel FROM ranking_entries e JOIN ranking_snapshots s ON s.id = e.snapshot_id JOIN buildings b ON b.id = s.building_id WHERE e.builder_id = ? AND s.captured_at BETWEEN ? AND ? ORDER BY s.captured_at ASC, b.region ASC, b.building_type ASC, b.level ASC",
        [builderId, from, to]
      );
    }

    // Calculate points delta relative to the previous entry for the same building
    const lastPointsByBuilding = new Map<number, number>();
    const enrichedRows = rows.map((row) => {
      const buildingIdForRow = Number(row.buildingId);
      const currentPoints = Number(row.points);
      const prevPoints = lastPointsByBuilding.get(buildingIdForRow);
      const deltaPoints = prevPoints != null ? currentPoints - prevPoints : null;
      lastPointsByBuilding.set(buildingIdForRow, currentPoints);
      return { ...row, deltaPoints };
    });

    res.json({
      builderId,
      builderName: builder.name,
      buildingId: buildingId || null,
      from,
      to,
      points: enrichedRows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Failed to load builder history" });
  }
}
