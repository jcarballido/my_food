import fp from "fastify-plugin";
import {
  closeDatabase,
  createDatabase,
  type Database,
  type DatabasePool,
} from "@my_food/database";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    dbPool: DatabasePool;
  }
}

export default fp(async (fastify) => {
  const { db, pool } = createDatabase(fastify.env.DATABASE_URL);
  fastify.decorate("db", db);
  fastify.decorate("dbPool", pool);

  fastify.addHook("onClose", async (instance) => {
    await closeDatabase({ pool: instance.dbPool });
  });
});
