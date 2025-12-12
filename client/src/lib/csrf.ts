let csrfTokenPromise: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/csrf-token", {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to load CSRF token (${res.status})`);
  }

  const data = await res.json();
  if (!data?.csrfToken) {
    throw new Error("CSRF token missing in response");
  }
  return data.csrfToken as string;
}

export async function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetchCsrfToken().catch((err) => {
      csrfTokenPromise = null;
      throw err;
    });
  }
  return csrfTokenPromise;
}

export function clearCsrfTokenCache(): void {
  csrfTokenPromise = null;
}
