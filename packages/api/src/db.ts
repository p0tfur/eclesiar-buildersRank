import mysql from "mysql2/promise";

export function createPoolFromEnv(): mysql.Pool {
  const { VER_DB_HOST, VER_DB_PORT, VER_DB_USER, VER_DB_PASSWORD, VER_DB_NAME } = process.env;

  if (!VER_DB_HOST || !VER_DB_USER || !VER_DB_NAME) {
    throw new Error("Missing required DB config. Set VER_DB_HOST, VER_DB_USER and VER_DB_NAME in .env.");
  }

  return mysql.createPool({
    host: VER_DB_HOST,
    port: VER_DB_PORT ? parseInt(VER_DB_PORT, 10) || 3306 : 3306,
    user: VER_DB_USER,
    password: VER_DB_PASSWORD || "",
    database: VER_DB_NAME,
    connectionLimit: 10,
  });
}

let pool: mysql.Pool | null = null;

export function initPool(): mysql.Pool {
  if (!pool) {
    pool = createPoolFromEnv();
  }
  return pool;
}

export function getPool(): mysql.Pool {
  if (!pool) {
    throw new Error("Database pool not initialised. Call initPool() first.");
  }
  return pool;
}
