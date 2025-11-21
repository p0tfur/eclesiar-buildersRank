import dotenv from "dotenv";
import path from "path";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { initPool, getPool } from "./db";
import { handlePostSnapshot, handleGetBuildings, handleGetRankings, handleGetBuilderHistory } from "./rankings";

// Ładujemy .env z katalogu root projektu (ver/.env)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const port = process.env.VER_PORT || 4000;
const apiKeys = (process.env.VER_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

const allowedOrigins = (
  process.env.VER_CORS_ORIGINS ||
  "https://eclesiar.com,https://www.eclesiar.com,http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((o: string) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);

app.use(express.json());

// Initialize DB pool on startup
initPool();

// Simple healthcheck endpoint (also verifies DB connectivity)
app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[VER] Healthcheck failed", err);
    res.status(500).json({ status: "error" });
  }
});

// Snapshot upload endpoint
app.post("/api/rankings/snapshots", async (req: Request, res: Response, _next: NextFunction) => {
  if (apiKeys.length > 0) {
    const provided = String(req.headers["x-ver-api-key"] || "").trim();
    if (!provided || !apiKeys.includes(provided)) {
      return res.status(401).json({ status: "error", message: "Invalid API key" });
    }
  }
  await handlePostSnapshot(req, res);
});

// Buildings list
app.get("/api/buildings", async (req: Request, res: Response) => {
  await handleGetBuildings(req, res);
});

// Rankings aggregated / snapshot
app.get("/api/rankings", async (req: Request, res: Response) => {
  await handleGetRankings(req, res);
});

// Builder history
app.get("/api/builders/:id/history", async (req: Request, res: Response) => {
  await handleGetBuilderHistory(req, res);
});

// Static frontend (built Vite app from packages/web/dist)
const staticRoot = path.resolve(__dirname, "../../../packages/web/dist");

app.use(express.static(staticRoot));

app.get("/", async (_req: Request, res: Response) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[VER] Unhandled error", err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`[VER] API listening on port ${port}`);
});
