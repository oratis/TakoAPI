"use client";

import { useCallback, useEffect, useState } from "react";

// Minimal async-data hook for the client pages that fetch from our own API (admin
// screens, engagement bars). It never calls setState synchronously inside the
// effect body — React's `set-state-in-effect` rule flags that pattern, and it was
// the single largest source of lint errors in this repo — so "loading" is
// *derived* from whether the stored result matches the current request key, and
// state only changes from inside the promise callbacks.
//
//   const { data, loading, error, reload } = useAsync(() => fetchJson(url), [url]);
//
// A response that arrives after the inputs changed (or after unmount) is dropped.

type Result<T> = { key: string; data?: T; error?: unknown };

export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[], enabled = true) {
  const key = JSON.stringify(deps);
  const [result, setResult] = useState<Result<T>>({ key: "" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fn().then(
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
    // `fn` is deliberately not a dependency. Callers pass an inline arrow, so it is
    // a new function on every render and including it would refetch in a loop; the
    // caller declares what the request actually depends on through `deps`, which
    // `key` serializes. Keeping the ref-free form also avoids writing a ref during
    // render, which React 19 forbids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
