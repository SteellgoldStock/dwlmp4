import { createApp } from './app.js';
import { DownloadService } from './downloads.js';

const production = process.argv[1]?.endsWith('.js') ?? false;
const port = Number(process.env.PORT || (production ? 3000 : 3001));
const host = process.env.HOST || '127.0.0.1';
const service = new DownloadService();
const server = createApp(service, production).listen(port, host, () => {
  console.log(`À garder · API${production ? ' + interface' : ''} sur http://${host}:${port}`);
  void service.health().then((health) => {
    if (!health.ready) console.warn(health.message);
  });
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await service.close();
  server.closeAllConnections();
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
