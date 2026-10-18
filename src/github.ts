// Auto-report unresolved titles to the orbisRPC missing-titles issue.
const API = "https://api.github.com";
const HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "nanodns-pinger (orbisRPC bot)",
};

export interface GithubReport {
  titleId: string;
  name: string | null;
  cover: string | null;
  player: string | null;
  seenAt: string;
  source: string;
}

export function parseIssueUrl(url: string): { repo: string; number: number } {
  const m = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/);
  if (!m) throw new Error(`not a GitHub issue URL: ${url}`);
  return { repo: `${m[1]}/${m[2]}`, number: Number(m[3]) };
}

export function commentBody(r: GithubReport): string {
  const name = r.name ? `\`${r.name}\`` : "unknown — ask the player";
  const cover = r.cover ?? "none found";
  return [
    `Auto-reported by [nanodns-pinger](https://github.com/SirHumza/nanodns-pinger).`,
    ``,
    `- **Title ID:** \`${r.titleId}\``,
    `- **Display name:** ${name}`,
    `- **Cover art:** ${cover}`,
    `- **Seen playing on:** ${r.player ?? "a server member"} at ${r.seenAt}`,
    `- **Resolution:** ${r.source}`,
  ].join("\n");
}

async function request(
  repo: string,
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API}/repos/${repo}${path}`, {
    ...init,
    headers: { ...HEADERS, authorization: `Bearer ${token}`, ...init?.headers },
  });
}

// Does any existing comment already carry this title id? Survives Durable
// Object storage resets, which the per-title guard alone does not.
export async function alreadyReported(
  repo: string,
  number: number,
  token: string,
  titleId: string,
): Promise<boolean> {
  const res = await request(repo, `/issues/${number}/comments?per_page=100`, token);
  if (!res.ok) throw new Error(`github comments: HTTP ${res.status}`);
  const comments = (await res.json()) as { body?: string }[];
  return comments.some((c) => c.body?.includes(`\`${titleId}\``) === true);
}

export async function postComment(
  repo: string,
  number: number,
  token: string,
  body: string,
): Promise<void> {
  const res = await request(repo, `/issues/${number}/comments`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`github comment post: HTTP ${res.status} ${await res.text()}`);
}
