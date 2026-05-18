import { loadWorkerConfig } from '@xb/config/worker';
import { buildWorker } from './server.js';

const config = loadWorkerConfig();
const worker = await buildWorker(config);

try {
  await worker.listen({ host: config.host, port: config.port });
  worker.log.info({ port: config.port }, 'xB Matrix worker listening');
} catch (err) {
  worker.log.error(err, 'failed to start worker');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    worker.log.info({ signal }, 'shutting down worker');
    await worker.close();
    process.exit(0);
  });
}
