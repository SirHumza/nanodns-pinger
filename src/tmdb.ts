// Sony TMDB title lookup. Mirrors orbisrpc/tmdb_crypto.c: the request path is
// /tmdb2/<TID>_00_<40HEX>/<TID>_00.json where the hex is a keyed HMAC-SHA1. A
// hit means the id is a real retail title (its presence only broke because
// nanoDNS is not routing tmdb.np.dl.playstation.net); a miss means the id is
// not in Sony's catalogue, so it is homebrew and belongs in the community list.

const HOST = "https://tmdb.np.dl.playstation.net";

// Same 64-byte service key orbisRPC ships (tmdb_crypto.c).
const KEY = new Uint8Array([
  0xf5, 0xde, 0x66, 0xd2, 0x68, 0x0e, 0x25, 0x5b, 0x2d, 0xf7, 0x9e, 0x74, 0xf8,
  0x90, 0xeb, 0xf3, 0x49, 0x26, 0x2f, 0x61, 0x8b, 0xca, 0xe2, 0xa9, 0xac, 0xcd,
  0xee, 0x51, 0x56, 0xce, 0x8d, 0xf2, 0xcd, 0xf2, 0xd4, 0x8c, 0x71, 0x17, 0x3c,
  0xdc, 0x25, 0x94, 0x46, 0x5b, 0x87, 0x40, 0x5d, 0x19, 0x7c, 0xf1, 0xae, 0xd3,
  0xb7, 0xe9, 0x67, 0x1e, 0xeb, 0x56, 0xca, 0x67, 0x53, 0xc2, 0xe6, 0xb0,
]);

const TITLE_ID = /^[A-Z0-9]{9}$/;

export type TmdbStatus = "resolved" | "missing" | "error";

export interface TmdbResult {
  status: TmdbStatus;
  name?: string;
}

async function hmacSha1Hex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    KEY,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function tmdbPath(titleId: string): Promise<string | null> {
  if (!TITLE_ID.test(titleId)) return null;
  const hex = await hmacSha1Hex(`${titleId}_00`);
  return `/tmdb2/${titleId}_00_${hex}/${titleId}_00.json`;
}

interface TmdbBody {
  names?: { name?: string }[];
}

export async function tmdbResolve(
  titleId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TmdbResult> {
  const path = await tmdbPath(titleId);
  if (!path) return { status: "missing" };
  let res: Response;
  try {
    res = await fetchImpl(`${HOST}${path}`);
  } catch {
    // Transient network failure is NOT a catalogue miss. Caller must retry
    // rather than tell a retail user their game is homebrew.
    return { status: "error" };
  }
  // Sony answers an unknown id with 403 AccessDenied (not 404).
  if (res.status === 403 || res.status === 404) return { status: "missing" };
  if (!res.ok) return { status: "error" };
  const body = (await res.json()) as TmdbBody;
  const name = body?.names?.[0]?.name;
  return name ? { status: "resolved", name } : { status: "missing" };
}
