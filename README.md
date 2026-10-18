# nanodns-pinger

A Discord bot that watches members' Rich Presence and pings each person **once**
when their PS4 presence is broken, with the fix.

## How it decides

The bot holds a live gateway connection (Guild Presences intent) and reads
`PRESENCE_UPDATE` events. A "broken" presence is one whose playing activity name
is a raw title id (`CUSA12345` / `PPSA12345`) instead of a game name with cover
art. For each such id it asks Sony's TMDB service:

- **resolves** → a retail title; the user's DNS is blocking Sony's artwork host
  → ping the nanoDNS setup steps.
- **not found** → neither Sony nor orbisRPC's other sources have a name or cover
  for it (that is why the raw id is showing) → ping the user to open an artwork
  issue on orbisRPC so the title can be added.

A transient lookup failure is not treated as a verdict; the guard is left unset
and the title is retried on the next presence update.

## Deploy

Runs on Cloudflare Workers with one Durable Object that owns the gateway socket
and the per-user "already pinged" guard.

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in DISCORD_TOKEN
npx wrangler secret put DISCORD_TOKEN
npm run deploy
```

Enable the **Presence Intent** in the Discord developer portal (Bot → Privileged
Gateway Intents). Presence data is gateway-only; there is no REST equivalent.
The bot can only see members who are online and not Invisible.

## Config

| Var | Where | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | secret | Bot token. |
| `GUILD_ID` | var | Guild to watch. |
| `CHANNEL_ID` | var | Channel to post pings in. |
| `ISSUE_URL` | var (optional) | Where to send people to report an unknown title. Defaults to the orbisRPC missing-titles thread. |

## Dev

```sh
npm run typecheck
npm test
npm run dev
```

Poking a locally running worker (`curl http://localhost:8787`) forces the
Durable Object to connect on demand, in addition to the every-minute cron.
