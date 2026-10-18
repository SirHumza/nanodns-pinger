import { DurableObject } from "cloudflare:workers";
import { rawTitleId, type Activity } from "./detect";
import { tmdbResolve } from "./tmdb";

// Workers fetch() cannot load a wss:// URL; fetch the https form with the
// Upgrade header and read res.webSocket.
const GATEWAY_URL = "https://gateway.discord.gg/?v=10&encoding=json";
// GUILDS (1 << 0) | GUILD_PRESENCES (1 << 8). Presence data is gateway-only,
// there is no REST endpoint for it.
const INTENTS = (1 << 0) | (1 << 8);
const API = "https://discord.com/api/v10";

export interface Env {
  DISCORD_TOKEN: string;
  GUILD_ID: string;
  CHANNEL_ID: string;
  ISSUE_URL?: string;
  ADMIN_KEY?: string;
  GATEWAY: DurableObjectNamespace<Gateway>;
}
interface Hello {
  heartbeat_interval: number;
}

interface PresenceUpdate {
  guild_id?: string;
  user?: { id?: string };
  activities?: Activity[];
}

// Sony TMDB knows the id: it is a retail title whose presence only broke
// because nanoDNS is not routing Sony's artwork host.
function nanoDnsText(userId: string, raw: string, name?: string): string {
  const game = name ? `${name} (\`${raw}\`)` : `\`${raw}\``;
  return (
    `<@${userId}> your PS4 presence is showing ${game} with no cover art, ` +
    `which means your DNS is blocking Sony's artwork host.\n\n` +
    `Fix it:\n` +
    `1. Open \`/data/nanodns/nanodns.ini\` and add \`tmdb.np.dl.playstation.net\` at the top of \`[exceptions]\`.\n` +
    `2. Set your PS4's DNS to \`127.0.0.1\` so traffic actually goes through nanoDNS (the step most people miss).\n` +
    `3. Reboot the console.`
  );
}

// Sony TMDB does not know the id and neither does orbisRPC's other sources
// (that is why the raw id is showing at all). It is a title nobody has a name
// or cover for yet, so it needs posting to the orbisRPC missing-titles thread.
function unknownGameText(userId: string, raw: string, issueUrl: string): string {
  return (
    `<@${userId}> your PS4 presence is showing the raw title id \`${raw}\` ` +
    `with no cover art. orbisRPC could not resolve a name or artwork for this ` +
    `title anywhere, so it needs to be added.\n\n` +
    `Post it in the missing-titles thread with:\n` +
    `- the title id: \`${raw}\`\n` +
    `- the correct display name\n` +
    `- a cover art URL (optional, direct https link)\n\n` +
    `${issueUrl}`
  );
}

// One instance (idFromName("singleton")) owns the gateway socket and the
// "already pinged" set.
export class Gateway extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private seq: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recent: string[] = [];
  private inflight = new Set<string>();

  private trace(line: string): void {
    this.recent.push(`${new Date().toISOString()} ${line}`);
    if (this.recent.length > 200) this.recent.shift();
  }

  // Live introspection: wrangler tail does not surface this DO's logs.
  async debug(): Promise<unknown> {
    return {
      connected: !!this.ws && this.ws.readyState === WebSocket.OPEN,
      seq: this.seq,
      recent: this.recent,
    };
  }

  // Called from the Worker on each cron tick, and on demand. Reconnects if the
  // socket dropped, otherwise a no-op.
  async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const res = await fetch(GATEWAY_URL, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket;
    if (!ws) throw new Error("gateway: response carried no websocket");

    ws.accept();
    this.ws = ws;
    ws.addEventListener("message", (event) => this.onMessage(String(event.data)));
    ws.addEventListener("close", (event) => {
      console.log(`gateway closed: code=${event.code} reason=${event.reason}`);
      this.trace(`closed code=${event.code} reason=${event.reason}`);
      this.reset();
    });
    ws.addEventListener("error", () => {
      console.log("gateway socket error");
      this.reset();
    });

    // Ask for a presence snapshot so we do not wait for the next update.
    this.send({
      op: 2,
      d: {
        token: this.env.DISCORD_TOKEN,
        intents: INTENTS,
        properties: { os: "linux", browser: "cf-worker", device: "cf-worker" },
      },
    });
  }

  private reset(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // already closed
      }
      this.ws = null;
    }
  }

  private send(payload: unknown): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private onMessage(raw: string): void {
    let msg: { op: number; t?: string; s?: number | null; d?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.s !== null && msg.s !== undefined) this.seq = msg.s;

    if (msg.op === 10) {
      this.onHello(msg.d as Hello);
    } else if (msg.op === 0) {
      void this.onDispatch(msg.t ?? "", msg.d);
    }
  }

  private onHello(hello: Hello): void {
    if (this.timer) clearInterval(this.timer);
    const beat = (): void => this.send({ op: 1, d: this.seq });
    this.timer = setInterval(beat, hello.heartbeat_interval);
  }

  private async onDispatch(type: string, data: unknown): Promise<void> {
    if (type === "READY") {
      const { user } = data as { user?: { username?: string; id?: string } };
      this.trace(`READY as ${user?.username}`);
      return;
    }
    // GUILD_CREATE carries the initial presence snapshot; PRESENCE_UPDATE is
    // each later change. Trace both; only act on the watched guild.
    if (type === "GUILD_CREATE") {
      const g = data as { id?: string; presences?: PresenceUpdate[] };
      const watched = g.id === this.env.GUILD_ID;
      this.trace(`GUILD_CREATE guild=${g.id}${watched ? "" : " (other)"} presences=${g.presences?.length ?? 0}`);
      for (const presence of g.presences ?? []) {
        this.tracePresence(watched ? "" : "other ", presence);
        if (watched) await this.act(presence);
      }
      return;
    }
    if (type === "PRESENCE_UPDATE") {
      const p = data as PresenceUpdate;
      if (p.guild_id !== this.env.GUILD_ID) return;
      this.tracePresence("", p);
      await this.act(p);
    }
  }

  private tracePresence(tag: string, p: PresenceUpdate): void {
    const names = (p.activities ?? []).map((a) => `${a.type}:${a.name}`).join(",");
    this.trace(`  ${tag}user=${p.user?.id} act=[${names}]`);
  }

  private async act(p: PresenceUpdate): Promise<void> {
    const userId = p.user?.id;
    const raw = rawTitleId(p.activities);
    if (!userId || !raw) return;

    // Guard per user *and* title: a person can be told to fix nanoDNS for one
    // game and still need to report a different unresolved title.
    const key = `pinged:${userId}:${raw}`;
    // Claim synchronously before any await. orbisRPC reports a presence in
    // bursts, and the storage guard alone has await points where a concurrent
    // burst slips through and posts the same ping twice.
    if (this.inflight.has(key)) {
      this.trace(`  inflight ${userId}:${raw}`);
      return;
    }
    this.inflight.add(key);
    try {
      if (await this.ctx.storage.get(key)) {
        this.trace(`  skip guard ${userId}:${raw}`);
        return;
      }

      const tmdb = await tmdbResolve(raw);
      // A lookup failure is not a verdict: leave the guard unset and retry on
      // the next presence update rather than mislabelling the title.
      if (tmdb.status === "error") {
        this.trace(`  lookup error for ${raw}`);
        return;
      }

      const issueUrl =
        this.env.ISSUE_URL ?? "https://github.com/SirHumza/orbisRPC/issues/37";
      const content =
        tmdb.status === "resolved"
          ? nanoDnsText(userId, raw, tmdb.name)
          : unknownGameText(userId, raw, issueUrl);
      this.trace(`PING user=${userId} id=${raw} -> ${tmdb.status}`);

      await this.ctx.storage.put(key, Date.now());
      const ok = await this.post(content);
      // Roll the guard back on failure so a transient error retries next update.
      if (!ok) await this.ctx.storage.delete(key);
    } finally {
      this.inflight.delete(key);
    }
  }

  // Run the real ping path for a synthetic presence. End-to-end proof without
  // needing a console to be live.
  async simulate(userId: string, raw: string): Promise<string> {
    await this.act({ guild_id: this.env.GUILD_ID, user: { id: userId }, activities: [{ type: 0, name: raw }] });
    return "ok";
  }

  // Force a reconnect so a fresh IDENTIFY replays the GUILD_CREATE presence
  // snapshot. Needed because already-seen presences only re-report on change.
  async reconnect(): Promise<void> {
    this.reset();
    await this.ensureConnected();
  }

  private async post(content: string): Promise<boolean> {
    const res = await fetch(`${API}/channels/${this.env.CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bot ${this.env.DISCORD_TOKEN}`,
      },
      body: JSON.stringify({ content, allowed_mentions: { parse: ["users"] } }),
    });
    if (!res.ok) {
      console.log(`ping failed: ${res.status} ${await res.text()}`);
    }
    return res.ok;
  }
}
