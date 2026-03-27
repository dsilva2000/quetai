import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Detectar entorno:
// - APK (Capacitor): usar URL absoluta de Railway
// - Browser/Railway: URL relativa (mismo dominio)
const isCapacitor = typeof (window as any).Capacitor !== "undefined";
export const API_BASE = import.meta.env.VITE_API_URL ||
  (isCapacitor ? "https://quetai-production.up.railway.app" : "");

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "omit",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey[0]}`, {
      credentials: "omit",
    });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
