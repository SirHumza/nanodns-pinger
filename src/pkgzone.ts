// pkg-zone.com scrape for homebrew names + covers, mirroring
// orbisrpc/pkgzone.c: first <h1> that is not the site boilerplate is the title,
// cover path is derived from the id rather than parsed.
const HOST = "https://pkg-zone.com";
const BOILERPLATE = "Install HB-Store on your Playstation";

export interface PkgzoneHit {
  name: string;
  cover: string;
}

export function coverUrlFor(titleId: string): string {
  return `${HOST}/images/${titleId}/cover.png`;
}

export function squeeze(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// First <h1> that is not the site boilerplate, same rule as pkgzone_parse().
export function parseHeading(html: string): string | null {
  const headings = /<h1[^>]*>([\S\s]*?)<\/h1>/gi;
  for (const [, inner] of html.matchAll(headings)) {
    const text = squeeze(inner);
    if (text && text !== BOILERPLATE) return text;
  }
  return null;
}

export async function pkgzoneResolve(
  titleId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PkgzoneHit | null> {
  try {
    const res = await fetchImpl(`${HOST}/details/${titleId}`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const name = parseHeading(html);
    if (!name) return null;
    return { name, cover: coverUrlFor(titleId) };
  } catch {
    return null;
  }
}
