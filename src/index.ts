import type { Env } from "./gateway";

export { Gateway } from "./gateway";

function stub(env: Env) {
  return env.GATEWAY.get(env.GATEWAY.idFromName("singleton"));
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    await stub(env).ensureConnected();
    return new Response("ok\n");
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await stub(env).ensureConnected();
  },
} satisfies ExportedHandler<Env>;
