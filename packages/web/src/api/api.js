// Central place for VER API endpoints and simple helper functions.
// This file is plain JS on purpose (per project rule), even though the rest of the app uses TypeScript.

const runtimeOrigin =
  typeof window !== "undefined" && window.location && window.location.origin ? window.location.origin : undefined;

const API_BASE_URL =
  import.meta.env.VITE_VER_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:4000" : runtimeOrigin || "http://localhost:4000");

export const ENDPOINTS = {
  BUILDINGS: `${API_BASE_URL}/api/buildings`,
  RANKINGS: `${API_BASE_URL}/api/rankings`,
  SNAPSHOTS: `${API_BASE_URL}/api/rankings/snapshots`,
};

// Krótkie awarie bazy po stronie API (kilka sekund) nie powinny kończyć się
// błędem widocznym dla użytkownika — ponawiamy tylko błędy sieci i 5xx.
const RETRY_DELAYS_MS = [600, 1800, 4000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchJsonWithRetry(url, options = {}, label = "request") {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response.json();
      }

      // 4xx to błąd żądania — ponawianie nic nie zmieni.
      if (response.status < 500) {
        throw new Error(`${label} failed: ${response.status}`);
      }

      lastError = new Error(`${label} failed: ${response.status}`);
    } catch (err) {
      // TypeError z fetch = błąd sieci; błąd 4xx rzucony powyżej nie ma być ponawiany.
      if (err instanceof Error && /failed: 4\d\d$/.test(err.message)) {
        throw err;
      }
      lastError = err;
    }

    if (attempt >= RETRY_DELAYS_MS.length) {
      break;
    }

    const delay = RETRY_DELAYS_MS[attempt];
    console.warn(`[VER] ${label} retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay}ms`, lastError);
    await sleep(delay);
  }

  throw lastError || new Error(`${label} failed`);
}

export async function getBuildings(params = {}) {
  return fetchJsonWithRetry(buildUrl(ENDPOINTS.BUILDINGS, params), {}, "Load buildings");
}

export async function getBuilderHistory(builderId, params = {}) {
  return fetchJsonWithRetry(
    buildUrl(`${API_BASE_URL}/api/builders/${builderId}/history`, params),
    {},
    "Load builder history"
  );
}

export async function getRankings(params = {}) {
  return fetchJsonWithRetry(buildUrl(ENDPOINTS.RANKINGS, params), {}, "Load rankings");
}

export async function postSnapshot(payload) {
  const response = await fetch(ENDPOINTS.SNAPSHOTS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to send snapshot: ${response.status}`);
  }

  return response.json();
}
