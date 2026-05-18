import fp from 'fastify-plugin';
import pg from 'pg';

const { Pool } = pg;

export const dbPlugin = fp(async (app) => {
  const pool = new Pool({
    connectionString: app.config.database.url,
    min: app.config.database.poolMin,
    max: app.config.database.poolMax,
    application_name: 'xb-worker',
  });
  await pool.query('SELECT 1');
  app.decorate('pg', pool);
  app.addHook('onClose', async () => {
    await pool.end();
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    pg: pg.Pool;
  }
}
