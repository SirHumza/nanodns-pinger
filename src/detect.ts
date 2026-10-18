export interface Activity {
  type?: number;
  name?: string;
}

// A Discord Rich Presence whose name is a bare title id means the game-name
// and cover-art lookup failed. Title ids are 9 uppercase alphanumerics; the
// prefix is not always CUSA/PPSA (MRCH, PPSA, HARC, homebrew ids, ...), so
// match the shape, not a prefix list. Type 0 is "Playing".
const RAW_TITLE_ID = /^[A-Z0-9]{9}$/;

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
