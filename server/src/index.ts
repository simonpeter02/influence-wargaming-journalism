import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { APP_PORT, ROOT, USE_STUB, GAME_MODEL, DEMO_MODEL } from './config.js';
import { registerSockets } from './sockets.js';
import { allTimeStats } from './db.js';

export function startServer(port: number) {
  const app = express();
  app.use(express.json());
  app.get('/api/stats', (_req, res) => res.json(allTimeStats()));

  // Serve the built client if present (production mode: no vite needed)
  const dist = path.join(ROOT, 'client', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: true } });
  registerSockets(io);

  httpServer.listen(port, () => {
    console.log(
      `Wargame server on http://localhost:${port}  (LLM: ${USE_STUB ? 'STUB — no OpenAI calls' : `${GAME_MODEL} / demo ${DEMO_MODEL}`})`,
    );
  });
  return { httpServer, io };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  startServer(APP_PORT);
}
