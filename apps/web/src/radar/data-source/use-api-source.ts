"use client";
import { useEffect, useState } from "react";
import type { Site } from "@tracel/radar-contracts";
import { getSnapshot } from "./api";
import { emptySnapshot, toStream } from "./snapshot";
import { useRadarStore } from "../store";
export function useApiSource(source?: { site: Site; token: string }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!source);
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    useRadarStore.getState().reset(emptySnapshot());
    setLoading(true);
    const poll = async () => {
      try {
        const result = await getSnapshot(
          source.site,
          source.token,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        useRadarStore.getState().sync(toStream(result));
        setError("");
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "连接失败");
          useRadarStore.getState().reset(emptySnapshot());
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(poll, 15_000);
        }
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      useRadarStore.getState().reset(emptySnapshot());
    };
  }, [source?.site.id, source?.token]);
  return { error, loading };
}
