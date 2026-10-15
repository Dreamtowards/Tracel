import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultCategories, parseCategories, type CategoryConfig } from "@tracel/timeline";
import { nativeClient } from "./native";

export function useCategories() {
  const [config, setConfig] = useState<CategoryConfig>(() => parseCategories(defaultCategories));
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!nativeClient) return;
    let active = true, pending = false;
    const reload = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await invoke<{ path: string; config: unknown }>("category_configuration");
        if (active) { setPath(result.path); setConfig(parseCategories(result.config)); setError(""); }
      } catch (reason) { if (active) setError(String(reason)); }
      finally { pending = false; }
    };
    void reload();
    window.addEventListener("focus", reload);
    return () => { active = false; window.removeEventListener("focus", reload); };
  }, []);
  return { config, path, error };
}
