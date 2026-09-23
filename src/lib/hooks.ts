"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, request } from "./client";

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export function useResource<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string; loading: boolean }>({ url, data: null, error: "", loading: Boolean(url) });
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!url) return;
    const token = ++generation.current;
    try {
      const data = await request<T>(url);
      if (token === generation.current) setState({ url, data, error: "", loading: false });
    } catch (error) {
      if (token === generation.current) setState((old) => ({ url, data: old.url === url ? old.data : null, error: errorMessage(error), loading: false }));
    }
  }, [url]);
  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, [refresh]);
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : "", loading: Boolean(url) && (state.url !== url || state.loading), refresh };
}
