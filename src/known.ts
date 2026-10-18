// Curated name + cover for homebrew titles that neither Sony's retail
// catalogue nor pkg-zone lists. Cover must be a direct, square-image https URL.
import type { PkgzoneHit } from "./pkgzone";

export const KNOWN_HOMEBREW: Record<string, { name: string; cover: string }> = {
  MRCH00033: {
    name: "M33 (March33)",
    cover: "https://raw.githubusercontent.com/iHaiDeeZ/M33/HEAD/sce_sys/icon0.png",
  },
};

export function knownResolve(titleId: string): PkgzoneHit | null {
  const hit = KNOWN_HOMEBREW[titleId];
  return hit ? { name: hit.name, cover: hit.cover } : null;
}
