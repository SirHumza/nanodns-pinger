export interface Activity {
  type?: number;
  name?: string;
}

// A Discord Rich Presence whose name is a bare title id means the game-name
// and cover-art lookup failed. On PS4 that is the DNS/TMDB case (orbisRPC
// shows CUSA12398 with a "?" tile). Type 0 is "Playing".
const RAW_TITLE_ID = /^(CUSA|PPSA)\d{5}$/;

export function rawTitleId(activities: Activity[] | undefined): string | null {
  if (!activities) return null;
  for (const activity of activities) {
    if (
      activity?.type === 0 &&
      typeof activity.name === "string" &&
      RAW_TITLE_ID.test(activity.name)
    ) {
      return activity.name;
    }
  }
  return null;
}

export function isBrokenRpc(activities: Activity[] | undefined): boolean {
  return rawTitleId(activities) !== null;
}
