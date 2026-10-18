import { useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { nativeClient } from "./native";

/** Reveal after the React shell commits and the browser has had a paint opportunity. */
export default function StartupReady({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!nativeClient) return;
    let second = 0;
    let done = false;
    const ready = () => {
      if (done) return;
      done = true;
      void invoke("frontend_ready").catch((error) => console.error("Startup handoff failed", error));
    };
    // Hidden WebViews may suspend animation frames; don't make visibility depend on them.
    const fallback = window.setTimeout(ready, 250);
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(ready);
    });
    return () => { window.clearTimeout(fallback); cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);
  return children;
}
