export interface Route {
  simId: string | null;
  params: Record<string, string>;
}

export function parseHash(hash = window.location.hash): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const trimmed = raw.startsWith("/") ? raw.slice(1) : raw;
  if (!trimmed) return { simId: null, params: {} };
  const [path, query] = trimmed.split("?");
  const simId = path === "" || path === "home" ? null : path;
  const params: Record<string, string> = {};
  if (query) {
    const sp = new URLSearchParams(query);
    sp.forEach((value, key) => {
      params[key] = value;
    });
  }
  return { simId, params };
}

export function formatHash(simId: string | null, params: Record<string, string>): string {
  if (!simId) return "#/";
  const sp = new URLSearchParams();
  const keys = Object.keys(params).sort();
  for (const k of keys) {
    const v = params[k];
    if (v !== "") sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `#/${simId}?${q}` : `#/${simId}`;
}

export function replaceHash(simId: string | null, params: Record<string, string>): void {
  const next = formatHash(simId, params);
  if (window.location.hash === next || (window.location.hash === "" && next === "#/")) return;
  history.replaceState(null, "", next);
}

export function pushHash(simId: string | null, params: Record<string, string>): void {
  const next = formatHash(simId, params);
  if (window.location.hash === next) return;
  history.pushState(null, "", next);
}

export function coerceNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function coerceBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}
