import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const fastify = await buildApp(env);

  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info({ signal }, "Shutting down");
    try {
      await fastify.close();
      process.exit(0);
    } catch (error) {
      fastify.log.error({ err: error }, "Failed to shut down cleanly");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await fastify.listen({ port: env.PORT, host: env.HOST });
  fastify.log.info(
    { port: env.PORT, timezone: env.APP_TIMEZONE },
    "Server listening",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
