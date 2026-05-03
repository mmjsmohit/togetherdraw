import type { Board, Session } from "./board-types";

const SESSION_STORAGE_KEY = "togetherdraw.session";

export const HTTP_API_URL =
  process.env.NEXT_PUBLIC_HTTP_API_URL || "http://localhost:4000";

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4001";

function readStoredSession(): Session | null {
  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession) as Session;
    if (session.token && session.user?.id) {
      return session;
    }
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  return null;
}

function storeSession(session: Session) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export async function ensureAnonSession(): Promise<Session> {
  const existingSession = readStoredSession();
  if (existingSession) {
    return existingSession;
  }

  const response = await fetch(`${HTTP_API_URL}/anon-login`, {
    method: "POST",
  });
  const session = await parseResponse<Session>(response);
  storeSession(session);
  return session;
}

export async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${HTTP_API_URL}${path}`, {
    ...init,
    headers,
  });

  return parseResponse<T>(response);
}

export async function createBoard(slug: string, token: string) {
  return apiRequest<{ board: Board }>("/boards", token, {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
}

export async function joinBoard(slug: string, token: string) {
  return apiRequest<{ message: string }>(
    `/boards/${encodeURIComponent(slug)}/join`,
    token,
    {
      method: "POST",
    },
  );
}

export async function getBoard(slug: string, token: string) {
  return apiRequest<{ board: Board }>(
    `/boards/${encodeURIComponent(slug)}`,
    token,
  );
}

export async function saveBoardContent(
  slug: string,
  token: string,
  content: string,
) {
  return apiRequest<{ message: string }>(
    `/boards/${encodeURIComponent(slug)}/save`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
}
