import type { SystemObservation } from "./native";

// PDH and DXGI can spell the same hexadecimal LUID with different casing.
export const gpuIdentity = (id: string) => id.toLowerCase();
export const isGpuFallbackName = (name: string) => !name.trim() || /^(?:GPU\s+)?luid_/i.test(name.trim()) || /^GPU(?:\s+\d+)?$/i.test(name.trim());

export type GpuDisplayOptions = { simplifyGpuNames?: boolean; showSoftwareGpus?: boolean };
export const isSoftwareGpuName = (name: string) => /^Microsoft Basic Render Driver$/i.test(name.trim());
export function simplifyGpuName(name: string) {
  return name.replace(/\bGeForce\s+/gi, "").replace(/\s+(?:Graphics|GPU)$/i, "").replace(/\s+/g, " ").trim();
}

/** Display-only options: archive values and identity never change. */
export function gpuDisplayNames(samples: SystemObservation[], options: GpuDisplayOptions = {}) {
  const resolved = new Map<string, string>();
  for (const sample of samples) for (const gpu of sample.gpus ?? []) {
    const id = gpuIdentity(gpu.id);
    if (!resolved.has(id)) resolved.set(id, "");
    if (!isGpuFallbackName(gpu.name)) resolved.set(id, gpu.name.trim());
  }
  const names = new Map<string, string>();
  for (const [id, name] of resolved) {
    if (!options.showSoftwareGpus && isSoftwareGpuName(name)) continue;
    names.set(id, name ? options.simplifyGpuNames === false ? name : simplifyGpuName(name) : `GPU ${names.size + 1}`);
  }
  return names;
}
