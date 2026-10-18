import type { Env } from "./gateway";

export { Gateway } from "./gateway";

function stub(env: Env) {
  return env.GATEWAY.get(env.GATEWAY.idFromName("singleton"));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const gateway = stub(env);
    // Admin/ops hooks. Off unless ADMIN_KEY is set and matches, so a public
    // worker URL cannot be used to force reconnects or fire test pings.
    const admin = !!env.ADMIN_KEY && url.searchParams.get("key") === env.ADMIN_KEY;

    if (admin && url.searchParams.has("debug")) {
      return Response.json(await gateway.debug());
    }
    if (admin && url.searchParams.has("reconnect")) {
      await gateway.reconnect();
      return new Response("reconnected\n");
    }
    if (admin && url.searchParams.has("simulate")) {
      const userId = url.searchParams.get("user") ?? "";
      const raw = url.searchParams.get("id") ?? "";
      return new Response((await gateway.simulate(userId, raw)) + "\n");
    }

    await gateway.ensureConnected();
    return new Response("ok\n");
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await stub(env).ensureConnected();
  },
} satisfies ExportedHandler<Env>;
