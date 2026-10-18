/** Coalesce high-frequency input, with an explicit final flush on pointer-up. */
export function frameQueue(
  request = (callback: FrameRequestCallback) => requestAnimationFrame(callback),
  cancel = (id: number) => cancelAnimationFrame(id),
) {
  let frame: number | null = null;
  let pending: (() => void) | null = null;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    const callback = pending;
    pending = null;
    callback?.();
  };
  return {
    schedule(callback: () => void) {
      pending = callback;
      if (frame === null) frame = request(flush);
    },
    flush,
    clear() { if (frame !== null) cancel(frame); frame = null; pending = null; },
  };
}
