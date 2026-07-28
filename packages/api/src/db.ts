import mysql from "mysql2/promise";
import type { FieldPacket, PoolConnection, QueryResult } from "mysql2/promise";

// Szczegółowe logi puli (acquire/release) tylko na życzenie — inaczej zaśmiecają logi produkcyjne.
const DB_DEBUG = process.env.VER_DB_DEBUG === "1";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createPoolFromEnv(): mysql.Pool {
  const { VER_DB_HOST, VER_DB_PORT, VER_DB_USER, VER_DB_PASSWORD, VER_DB_NAME } = process.env;

  if (!VER_DB_HOST || !VER_DB_USER || !VER_DB_NAME) {
    throw new Error("Missing required DB config. Set VER_DB_HOST, VER_DB_USER and VER_DB_NAME in .env.");
  }

  const connectionLimit = envInt("VER_DB_CONNECTION_LIMIT", 10);
  // maxIdle MUSI być mniejsze od connectionLimit — tylko wtedy mysql2 uruchamia
  // zadanie usuwające bezczynne połączenia (patrz mysql2/lib/base/pool.js).
  const maxIdle = Math.min(envInt("VER_DB_MAX_IDLE", 2), Math.max(1, connectionLimit - 1));
  // Krócej niż wait_timeout serwera MySQL / idle timeout NAT-a, żeby nigdy nie
  // wziąć z puli połączenia zamkniętego po drugiej stronie.
  const idleTimeout = envInt("VER_DB_IDLE_TIMEOUT_MS", 30000);

  return mysql.createPool({
    host: VER_DB_HOST,
    port: VER_DB_PORT ? parseInt(VER_DB_PORT, 10) || 3306 : 3306,
    user: VER_DB_USER,
    password: VER_DB_PASSWORD || "",
    database: VER_DB_NAME,
    connectionLimit,
    maxIdle,
    idleTimeout,
    waitForConnections: true,
    queueLimit: 100,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: envInt("VER_DB_CONNECT_TIMEOUT_MS", 10000),
  });
}

let pool: mysql.Pool | null = null;

export function initPool(): mysql.Pool {
  if (!pool) {
    pool = createPoolFromEnv();

    // Błąd na bezczynnym połączeniu nie może wywalić procesu — pula sama je usuwa.
    pool.on("connection", (conn: PoolConnection) => {
      conn.on("error", (err: NodeJS.ErrnoException) => {
        console.warn(`[VER][DB] Idle connection error (${err.code || "unknown"}): ${err.message}`);
      });
    });

    pool.on("enqueue", () => {
      console.warn("[VER][DB] Connection queued — pool may be exhausted!");
    });

    if (DB_DEBUG) {
      pool.on("acquire", () => {
        console.log("[VER][DB] Connection acquired from pool");
      });
      pool.on("release", () => {
        console.log("[VER][DB] Connection released back to pool");
      });
    }
  }
  return pool;
}

export function getPool(): mysql.Pool {
  if (!pool) {
    throw new Error("Database pool not initialised. Call initPool() first.");
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Kody/komunikaty oznaczające, że połączenie zostało zerwane i operację można
// bezpiecznie powtórzyć na świeżym połączeniu.
const RETRYABLE_ERROR_CODES = new Set([
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "PROTOCOL_ENQUEUE_AFTER_QUIT",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_CLIENT_INTERACTION_TIMEOUT",
  "ER_LOCK_DEADLOCK",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

const RETRYABLE_MESSAGE_PATTERN =
  /connection lost|closed state|can't add new command when connection is in closed state|server has gone away|read econnreset/i;

function errorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function isRetryableDbError(err: unknown): boolean {
  const code = errorCode(err);
  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }
  const message = err instanceof Error ? err.message : "";
  return RETRYABLE_MESSAGE_PATTERN.test(message);
}

const RETRY_DELAYS_MS = [100, 500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wykonuje operację DB i ponawia ją, gdy padła z powodu zerwanego połączenia.
 * Kolejna próba bierze z puli inne (świeże) połączenie.
 */
export async function withDbRetry<T>(operation: () => Promise<T>, label = "query"): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      if (!isRetryableDbError(err) || attempt >= RETRY_DELAYS_MS.length) {
        throw err;
      }

      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(
        `[VER][DB] ${label} failed with ${errorCode(err) || "unknown"} — retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay}ms`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

export interface SqlExecutor {
  execute<T extends QueryResult>(sql: string, values?: unknown[]): Promise<[T, FieldPacket[]]>;
  query<T extends QueryResult>(sql: string, values?: unknown[]): Promise<[T, FieldPacket[]]>;
}

/**
 * Executor zgodny API z Pool, ale odporny na PROTOCOL_CONNECTION_LOST.
 * Używać dla zapytań odczytowych (idempotentnych) poza transakcją.
 */
export const db: SqlExecutor = {
  execute<T extends QueryResult>(sql: string, values?: unknown[]): Promise<[T, FieldPacket[]]> {
    return withDbRetry(() => getPool().execute<T>(sql, values ?? []), "execute");
  },
  query<T extends QueryResult>(sql: string, values?: unknown[]): Promise<[T, FieldPacket[]]> {
    return withDbRetry(() => getPool().query<T>(sql, values ?? []), "query");
  },
};

/**
 * Uruchamia callback w transakcji na dedykowanym połączeniu.
 * Przy zerwanym połączeniu cała transakcja jest powtarzana (nic nie zostało
 * zacommitowane), a połączenie zawsze wraca do puli.
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return withDbRetry(async () => {
    const conn = await getPool().getConnection();

    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.warn(`[VER][DB] Rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}`);
      }
      throw err;
    } finally {
      try {
        conn.release();
      } catch (releaseErr) {
        console.warn(`[VER][DB] Release failed: ${releaseErr instanceof Error ? releaseErr.message : releaseErr}`);
      }
    }
  }, "transaction");
}
