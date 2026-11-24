"use client";
// 긴 조회 기간을 7일 구간으로 나눠 차례로 불러온다. 진행 상황(몇 번째 구간)을 알려 준다.
import { useCallback, useRef, useState } from "react";
import { splitWindows } from "@/lib/dates";
import type { WindowResult } from "@/lib/types";
import { getJson } from "./format";

export interface WindowedState<T> {
  items: T[];
  loading: boolean;
  done: number;
  total: number;
  error: unknown;
  fetchedAt: string;
  cachedWindows: number;
  range: { from: string; to: string } | null;
}

const initial = { items: [], loading: false, done: 0, total: 0, error: null, fetchedAt: "", cachedWindows: 0, range: null };

export function useWindowedFetch<T>(endpoint: string, onWindowDone?: () => void) {
  const [state, setState] = useState<WindowedState<T>>(initial);
  const ctrl = useRef<AbortController | null>(null);

  const run = useCallback(
    async (code: string, from: string, to: string) => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const windows = splitWindows(from, to);
      setState({ ...initial, loading: true, total: windows.length, range: { from, to } });
      const items: T[] = [];
      let cached = 0;
      let fetchedAt = "";
      try {
        // 최근 구간부터 불러 화면에 먼저 보이게 한다
        for (const [i, w] of [...windows].reverse().entries()) {
          const r = await getJson<WindowResult<T>>(`${endpoint}?code=${code}&from=${w.from}&to=${w.to}`, c.signal);
          items.push(...r.items);
          if (r.cached) cached++;
          if (!fetchedAt || r.fetchedAt < fetchedAt) fetchedAt = r.fetchedAt;
          if (c.signal.aborted) return;
          setState((s) => ({ ...s, items: [...items], done: i + 1, cachedWindows: cached, fetchedAt }));
          onWindowDone?.();
        }
        setState((s) => ({ ...s, loading: false }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState((s) => ({ ...s, loading: false, error: e }));
        onWindowDone?.();
      }
    },
    [endpoint, onWindowDone],
  );

  const reset = useCallback(() => {
    ctrl.current?.abort();
    setState(initial);
  }, []);

  return { state, run, reset };
}
