import type { ActivityInterval, Application, Range } from "./model";

export type ForegroundAppInterval = Range & { appId: string };

/** Presentation only: ordered source intervals keep their original window contexts. */
export function foregroundAppIntervals(activity: ActivityInterval[], apps: Application[]): ForegroundAppInterval[] {
  const identities = new Map(apps.map(app => [app.id, app.exe
    ? `exe:${app.exe.replaceAll("\\", "/").toLowerCase()}` : `app:${app.id}`]));
  const result: ForegroundAppInterval[] = [];
  for (const event of activity) {
    const previous = result.at(-1);
    if (previous && previous.end === event.start &&
      (identities.get(previous.appId) ?? previous.appId) === (identities.get(event.appId) ?? event.appId)) {
      previous.end = event.end;
    } else result.push({ start: event.start, end: event.end, appId: event.appId });
  }
  return result;
}
