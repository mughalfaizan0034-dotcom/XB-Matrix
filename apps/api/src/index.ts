import { loadApiConfig } from '@xb/config/api';
import { buildServer } from './server.js';

const config = loadApiConfig();
const server = await buildServer(config);

try {
  await server.listen({ host: config.host, port: config.port });
  server.log.info({ port: config.port }, 'xB Matrix API listening');
} catch (err) {
  server.log.error(err, 'failed to start API');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    server.log.info({ signal }, 'shutting down');
    await server.close();
    process.exit(0);
  });
}
