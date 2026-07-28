import { db, envInt, getPoolStats, isRetryableDbError } from "./db";
import type { PoolStats } from "./db";

// Heartbeat ma dwa zadania:
// 1) utrzymać w puli ciepłe połączenie, żeby żądanie użytkownika po długim
//    przestoju nie musiało otwierać nowego (i nie trafiało na blip serwera),
// 2) wykrywać awarie bazy niezależnie od ruchu — w logach widać wtedy dokładne
//    okno niedostępności, także wtedy gdy nikt nie korzysta z aplikacji.
//
// Interwał MUSI być krótszy niż wait_timeout serwera MySQL.
const HEARTBEAT_INTERVAL_MS = envInt("VER_DB_HEARTBEAT_MS", 20000);

export interface DbHealthSnapshot {
  heartbeatIntervalMs: number;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  pool: PoolStats;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastOkAt: number | null = null;
let lastErrorAt: number | null = null;
let lastErrorCode: string | null = null;
let lastErrorMessage: string | null = null;
let consecutiveFailures = 0;

function errorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

async function runHeartbeat(): Promise<void> {
  // Nakładające się przebiegi nic nie wnoszą, a mogą zająć połączenia z puli.
  if (running) return;
  running = true;

  const startedAt = Date.now();

  try {
    await db.query("SELECT 1");

    const wasFailing = consecutiveFailures > 0;
    lastOkAt = Date.now();
    consecutiveFailures = 0;

    if (wasFailing) {
      console.log(`[VER][DB] Heartbeat recovered after ${Date.now() - startedAt}ms | pool ${JSON.stringify(getPoolStats())}`);
    }
  } catch (err) {
    consecutiveFailures += 1;
    lastErrorAt = Date.now();
    lastErrorCode = errorCode(err);
    lastErrorMessage = err instanceof Error ? err.message : String(err);

    console.error(
      `[VER][DB] Heartbeat failed (#${consecutiveFailures}, retryable=${isRetryableDbError(err)}) ${lastErrorCode || "unknown"}: ${lastErrorMessage} | pool ${JSON.stringify(getPoolStats())}`
    );
  } finally {
    running = false;
  }
}

export function startDbHeartbeat(): void {
  if (timer) return;

  timer = setInterval(() => {
    void runHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // Nie blokuj zamknięcia procesu przez sam timer.
  timer.unref();

  void runHeartbeat();

  console.log(`[VER][DB] Heartbeat started (every ${HEARTBEAT_INTERVAL_MS}ms)`);
}

export function stopDbHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getDbHealth(): DbHealthSnapshot {
  return {
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null,
    lastErrorAt: lastErrorAt ? new Date(lastErrorAt).toISOString() : null,
    lastErrorCode,
    lastErrorMessage,
    consecutiveFailures,
    pool: getPoolStats(),
  };
}
