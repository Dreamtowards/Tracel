import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

// Share reads across mounts and collector refreshes; never retry failures on every sample.
const requests = new Map<string, Promise<Uint8Array | null>>();
const waiting: (() => void)[] = [];
let running = 0;
async function read(executable: string) {
  if (running >= 4) await new Promise<void>(resolve => waiting.push(resolve));
  else running++;
  try {
    const bytes = await invoke<number[] | null>("application_icon", { executable });
    return bytes ? new Uint8Array(bytes) : null;
  } catch { return null; }
  finally { const next = waiting.shift(); if (next) next(); else running--; }
}
function cached(executable: string) {
  const key = executable.replaceAll("\\", "/").toLowerCase();
  let request = requests.get(key);
  if (!request) {
    request = read(executable);
    if (requests.size >= 256) requests.delete(requests.keys().next().value!);
    requests.set(key, request);
  }
  return request;
}

export default function ApplicationIcon({ executable, fallback }: { executable: string; fallback: ReactNode }) {
  const [image, setImage] = useState<{ executable: string; url: string } | null>(null);
  useEffect(() => {
    if (!executable) return;
    let active = true, url: string | undefined;
    void cached(executable).then(bytes => {
      if (!active || !bytes) return;
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      setImage({ executable, url });
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [executable]);
  return image?.executable === executable
    ? <img src={image.url} alt="" width={16} height={16} draggable={false} onError={() => setImage(null)} style={{ objectFit: "contain", flexShrink: 0 }} />
    : fallback;
}
