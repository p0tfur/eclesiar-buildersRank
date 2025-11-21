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

export async function getBuildings(params = {}) {
  const url = new URL(ENDPOINTS.BUILDINGS);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to load buildings: ${response.status}`);
  }
  return response.json();
}

export async function getBuilderHistory(builderId, params = {}) {
  const url = new URL(`${API_BASE_URL}/api/builders/${builderId}/history`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to load builder history: ${response.status}`);
  }
  return response.json();
}

export async function getRankings(params = {}) {
  const url = new URL(ENDPOINTS.RANKINGS);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to load rankings: ${response.status}`);
  }
  return response.json();
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
