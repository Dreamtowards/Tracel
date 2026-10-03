import { create } from "zustand";
import type { StreamSnapshot, Visitor } from "./types";

interface RadarState extends StreamSnapshot {
  selectedVisitor: Visitor | null;
  paused: boolean;
  speed: number;
  sync: (snapshot: StreamSnapshot) => void;
  select: (visitor: Visitor | null) => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  reset: (snapshot: StreamSnapshot) => void;
}
export const useRadarStore = create<RadarState>((set) => ({
  visitors: {},
  events: [],
  recentEventTimes: [],
  now: 0,
  selectedVisitor: null,
  paused: false,
  speed: 1,
  sync: (snapshot) =>
    set((state) => ({
      ...snapshot,
      selectedVisitor: state.selectedVisitor
        ? (snapshot.visitors[state.selectedVisitor.id] ?? state.selectedVisitor)
        : null,
    })),
  select: (visitor) =>
    set((state) => ({
      selectedVisitor: visitor
        ? (state.visitors[visitor.id] ??
          state.events.find((event) => event.visitorId === visitor.id)
            ?.visitor ??
          visitor)
        : null,
    })),
  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
  reset: (snapshot) =>
    set({ ...snapshot, selectedVisitor: null, paused: false, speed: 1 }),
}));
