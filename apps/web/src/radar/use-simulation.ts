"use client";

import { useEffect, useRef, useCallback } from "react";
import { MockVisitorStream } from "./simulation/simulation";
import { useRadarStore } from "./store";

export function useSimulation(seed = 42) {
  const stream = useRef<MockVisitorStream | null>(null);
  useEffect(() => {
    const engine = new MockVisitorStream(Date.now(), seed);
    stream.current = engine;
    useRadarStore.getState().reset(engine.snapshot());
    let previous = performance.now();
    const interval = setInterval(() => {
      const wallNow = performance.now();
      const delta = Math.min(wallNow - previous, 2000);
      previous = wallNow;
      const { paused, speed } = useRadarStore.getState();
      if (!paused && !document.hidden) {
        const current = stream.current;
        if (current) {
          current.advance(delta * speed);
          useRadarStore.getState().sync(current.snapshot());
        }
      }
    }, 250);
    return () => {
      clearInterval(interval);
      stream.current = null;
    };
  }, [seed]);

  const reset = useCallback(() => {
    stream.current = new MockVisitorStream(Date.now(), seed);
    useRadarStore.getState().reset(stream.current.snapshot());
  }, [seed]);
  const spawn = useCallback(() => {
    const engine = stream.current;
    if (
      !engine ||
      Object.values(engine.snapshot().visitors).filter(
        (v) => v.status !== "offline",
      ).length >= 150
    )
      return;
    engine.spawn();
    useRadarStore.getState().sync(engine.snapshot());
  }, []);
  // The timer reads this ref so resets replace the source without another interval.
  return { reset, spawn, stream };
}
