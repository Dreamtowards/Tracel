import type { SystemObservation } from "./native";

// PDH and DXGI can spell the same hexadecimal LUID with different casing.
export const gpuIdentity = (id: string) => id.toLowerCase();
export const isGpuFallbackName = (name: string) => !name.trim() || /^(?:GPU\s+)?luid_/i.test(name.trim()) || /^GPU(?:\s+\d+)?$/i.test(name.trim());

/** Prefer the latest resolved name without guessing identities across Windows sessions. */
export function gpuDisplayNames(samples: SystemObservation[]) {
  const names = new Map<string, string>();
  for (const sample of samples) for (const gpu of sample.gpus ?? []) {
    const id = gpuIdentity(gpu.id);
    if (!names.has(id)) names.set(id, `GPU ${names.size + 1}`);
    if (!isGpuFallbackName(gpu.name)) names.set(id, gpu.name.trim());
  }
  return names;
}
