"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal async-data hook for the few remaining client pages that fetch from our
// own API (admin screens, engagement bars). It never calls setState synchronously
// inside the effect body — React's `set-state-in-effect` rule flags that pattern —
// so "loading" is *derived* from whether the stored result matches the current
// request key, and state only changes from inside the promise callbacks.
//
//   const { data, loading, error, reload } = useAsync(() => fetchJson(url), [url]);
//
// A response that arrives after the inputs changed (or after unmount) is dropped.

type Result<T> = { key: string; data?: T; error?: unknown };

export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[], enabled = true) {
  const key = JSON.stringify(deps);
  const [result, setResult] = useState<Result<T>>({ key: "" });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fnRef.current().then(
      (data) => {
        if (alive) setResult({ key, data });
      },
      (error) => {
        if (alive) setResult({ key, error });
      }
    );
    return () => {
      alive = false;
    };
  }, [key, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const fresh = result.key === key;
  return {
    data: fresh ? result.data : undefined,
    error: fresh ? result.error : undefined,
    loading: enabled && (!fresh || (result.data === undefined && result.error === undefined)),
    reload,
  };
}

/** fetch() + JSON with a thrown error on non-2xx, for use with useAsync. */
export async function fetchJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
