import { Capture, DAY, DataProvider, MetricSample } from "./model";

export function createCapture(): Capture {
  const data: Capture = {
    epoch: "2026-10-08T00:00:00+08:00",
    bounds: { start: 0, end: 7 * DAY },
    samplePeriod: 30,
    apps: [
      {
        id: "code",
        name: "VS Code",
        exe: "Code.exe",
        color: "#679dce",
        glyph: "code",
      },
      {
        id: "chrome",
        name: "Chrome",
        exe: "chrome.exe",
        color: "#d3ad65",
        glyph: "chrome",
      },
      {
        id: "unity",
        name: "Unity",
        exe: "Unity.exe",
        color: "#b398d3",
        glyph: "box",
      },
      {
        id: "figma",
        name: "Figma",
        exe: "Figma.exe",
        color: "#cf8f98",
        glyph: "figma",
      },
      {
        id: "spotify",
        name: "Spotify",
        exe: "Spotify.exe",
        color: "#7db58c",
        glyph: "music",
      },
      {
        id: "terminal",
        name: "Terminal",
        exe: "WindowsTerminal.exe",
        color: "#8dacae",
        glyph: "terminal",
      },
    ],
    activity: [],
    afk: [],
    background: [],
    metrics: [],
    media: [],
    events: [],
  };
  const sequence: [number, number, string][] = [
    [0.25, 0.8, "chrome"],
    [0.8, 1.25, "code"],
    [6.5, 7.1, "spotify"],
    [7.1, 7.8, "chrome"],
    [7.8, 8.35, "code"],
    [8.35, 8.6, "terminal"],
    [8.6, 9, "chrome"],
    [9, 9.8, "code"],
    [9.8, 10.1, "chrome"],
    [10.1, 10.95, "code"],
    [10.95, 11.6, "unity"],
    [11.6, 11.9, "chrome"],
    [11.9, 12.1, "terminal"],
    [12.1, 13.1, "code"],
    [13.1, 13.5, "figma"],
    [13.5, 14.25, "code"],
    [14.25, 14.7, "chrome"],
    [14.7, 15.5, "unity"],
    [15.5, 15.65, "spotify"],
    [15.65, 16.5, "code"],
    [16.5, 16.8, "chrome"],
    [16.8, 18, "code"],
    [18, 18.8, "chrome"],
    [18.8, 19.4, "figma"],
    [19.4, 20.3, "code"],
    [20.3, 21.1, "unity"],
    [21.1, 21.4, "terminal"],
    [21.4, 22.25, "chrome"],
    [22.25, 23.2, "code"],
    [23.2, 23.75, "spotify"],
  ];
  for (let day = 0; day < 7; day++) {
    const base = day * DAY;
    const shift = day === 6 ? 0 : ((day % 3) - 1) * 600;
    const at = (hour: number) => base + hour * 3600 + shift;
    for (const [i, [startHour, endHour, appId]] of sequence.entries()) {
      const start = at(startHour),
        end = at(endHour);
      const names =
        appId === "chrome" && (startHour < 9 || startHour >= 18)
          ? [
              "Morning reading / saved articles",
              "Photography & travel",
              "Evening video playlist",
            ]
          : appId === "spotify" && startHour >= 18
            ? ["After hours", "Night drive", "Wind down"]
            : appId === "code"
              ? ["Timeline.tsx", "useViewport.ts", "analytics.ts"]
              : appId === "chrome"
                ? [
                    "React documentation",
                    "tracel / pull requests",
                    "Designing better developer tools",
                  ]
                : appId === "unity"
                  ? [
                      "Tracel World — Scene",
                      "Compiling shaders",
                      "Scene preview",
                    ]
                  : appId === "figma"
                    ? [
                        "Explorer — design system",
                        "Timeline components",
                        "Inspector layout",
                      ]
                    : appId === "spotify"
                      ? ["Focus Flow", "Deep work", "In the zone"]
                      : ["npm run build", "git status", "npm run test"];
      data.activity.push({
        id: `${day}-${i}`,
        appId,
        start,
        end,
        windowTitle: `${names[0]} — ${data.apps.find((a) => a.id === appId)!.name}`,
        contexts: names.map((title, j) => ({
          start: start + ((end - start) * j) / 3,
          end: start + ((end - start) * (j + 1)) / 3,
          kind:
            appId === "chrome" ? "url" : appId === "code" ? "file" : "project",
          title,
          value:
            appId === "chrome"
              ? [
                  "https://react.dev/reference/react",
                  "https://github.com/tracel/explorer/pulls",
                  "https://www.youtube.com/watch?v=demo",
                ][j]
              : appId === "code"
                ? `C:/Projects/tracel/src/${title}`
                : "Tracel / Explorer",
        })),
      });
    }
    data.afk.push(
      { start: at(12.15), end: at(12.85), reason: "Lunch break" },
      { start: at(15.1), end: at(15.3), reason: "Away from keyboard" },
      { start: at(18.15), end: at(18.65), reason: "Dinner break" },
      { start: at(7.35), end: at(7.55), reason: "Coffee break" },
    );
    for (const app of data.apps)
      data.background.push({
        appId: app.id,
        start: at(app.id === "unity" ? 10.5 : app.id === "figma" ? 12.9 : 6.5),
        end: at(app.id === "figma" ? 19.6 : app.id === "unity" ? 21.2 : 23.8),
      });
    for (const appId of ["code", "chrome", "spotify"])
      data.background.push({ appId, start: at(0.25), end: at(1.25) });
    data.media.push(
      {
        start: at(6.5),
        end: at(8.5),
        appId: "spotify",
        title: "Morning coffee",
        artist: "Khruangbin · Men I Trust",
        state: "playing",
      },
      {
        start: at(18.05),
        end: at(18.75),
        appId: "chrome",
        title: "A walk through Kyoto",
        artist: "YouTube · Travel journal",
        state: "playing",
      },
      {
        start: at(19.4),
        end: at(21.1),
        appId: "spotify",
        title: "After hours",
        artist: "Nils Frahm · Kiasmos",
        state: "playing",
      },
      {
        start: at(21.4),
        end: at(22.25),
        appId: "chrome",
        title: "Creative coding sessions",
        artist: "YouTube · The coding notebook",
        state: "playing",
      },
      {
        start: at(23.2),
        end: at(23.75),
        appId: "spotify",
        title: "Night drive",
        artist: "The Midnight · FM-84",
        state: "playing",
      },
      {
        start: at(9.15),
        end: at(11.85),
        appId: "spotify",
        title: "Focus Flow",
        artist: "Tycho · Bonobo · Ólafur Arnalds",
        state: "playing",
      },
      {
        start: at(13.15),
        end: at(14.25),
        appId: "spotify",
        title: "Awake",
        artist: "Tycho",
        state: "playing",
      },
      {
        start: at(14.35),
        end: at(14.65),
        appId: "chrome",
        title: "Designing better developer tools",
        artist: "YouTube · Design engineering",
        state: "playing",
      },
      {
        start: at(15.5),
        end: at(17.75),
        appId: "spotify",
        title: "Migration",
        artist: "Bonobo",
        state: "playing",
      },
    );
    data.events.push(
      {
        start: at(11.02),
        end: at(11.42),
        kind: "compile",
        title: "Unity · Shader compilation",
      },
      {
        start: at(14.3),
        end: at(14.5),
        kind: "download",
        title: "Chrome · Asset pack download",
      },
      {
        start: at(1.25),
        end: at(6.5),
        kind: "sleep",
        title: "System asleep · No samples",
      },
      {
        start: at(20.4),
        end: at(20.65),
        kind: "compile",
        title: "Unity · Evening scene build",
      },
    );
    const dayActivity = data.activity.filter(
      (a) => a.start >= base && a.start < base + DAY,
    );
    for (let time = base; time < base + DAY; time += 30) {
      const h = (time - base - shift) / 3600;
      const awake = h < 1.25 || h >= 6.5;
      // Deterministic workload envelopes, correlated with foreground and background work.
      const compile = (h >= 11.02 && h < 11.42) || (h >= 20.4 && h < 20.65);
      const download = h >= 14.3 && h < 14.5;
      const unity = dayActivity.some(
        (a) => a.appId === "unity" && a.start <= time && a.end > time,
      );
      const idle =
        data.afk.some((a) => a.start <= time && a.end > time) ||
        !dayActivity.some((a) => a.start <= time && a.end > time);
      const wave = (Math.sin(time * 0.013) + Math.sin(time * 0.0037) + 2) / 4;
      const playing = data.media.some((m) => m.start <= time && m.end > time);
      const values: MetricSample["values"] =
        !awake || (h >= 16.1 && h < 16.13)
          ? null
          : {
              cpu: idle
                ? 3 + wave * 4
                : compile
                  ? 76 + wave * 22
                  : unity
                    ? 34 + wave * 36
                    : 9 + wave * 24,
              ram:
                9 +
                Math.max(0, Math.min(9, h - 9)) * 0.7 +
                (unity || compile ? 7 : 0) +
                wave * 0.8,
              gpu: idle ? 1 + wave : unity ? 40 + wave * 48 : 3 + wave * 9,
              download: download
                ? 19 + wave * 12
                : h >= 14.35 && h < 14.65
                  ? 1.8 + wave * 3
                  : wave * 0.3,
              upload: compile ? wave * 1.2 : wave * 0.12,
              read: compile ? 65 + wave * 80 : unity ? 8 + wave * 20 : wave * 3,
              write: download
                ? 20 + wave * 11
                : compile
                  ? 20 + wave * 50
                  : wave * 2,
              audio: playing ? 25 + wave * 55 : 0,
            };
      data.metrics.push({
        time,
        subject: { kind: "system", id: "local" },
        values,
      });
    }
  }
  return data;
}
let cached: Capture | undefined;
export const demoProvider: DataProvider = {
  async load() {
    return (cached ??= createCapture());
  },
};
