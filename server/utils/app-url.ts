const APP_URL_ENV_KEYS = ["APP_BASE_URL", "PUBLIC_URL", "CLIENT_URL", "VITE_APP_URL"] as const;

function computeBaseUrl(): string {
  for (const key of APP_URL_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.replace(/\/+$/, "");
    }
  }
  return "http://localhost:5173";
}

let cachedBaseUrl: string | undefined;

export function getAppBaseUrl(): string {
  if (!cachedBaseUrl) {
    cachedBaseUrl = computeBaseUrl();
  }
  return cachedBaseUrl;
}

export function buildAppUrl(path: string): string {
  const base = getAppBaseUrl();
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}
