import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { performServerWebResearch } from './src/engine/webResearch';
import type { GameVersion, SessionType, WeatherType } from './src/types/setup';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '64kb' }));

  app.post('/api/ai/web-research', async (req, res) => {
    try {
      const body = req.body ?? {};
      const circuitId = typeof body.circuitId === 'string' ? body.circuitId : 'silverstone';
      const circuitName = typeof body.circuitName === 'string' ? body.circuitName : 'Silverstone';
      const gameVersion: GameVersion =
        body.gameVersion === 'f1_25_2026_pack' ? 'f1_25_2026_pack' : 'f1_25_2025';
      const weather: WeatherType = body.weather === 'wet' ? 'wet' : 'dry';
      const sessionType: SessionType =
        body.sessionType === 'qualifying' ||
        body.sessionType === 'time_trial' ||
        body.sessionType === 'practice'
          ? body.sessionType
          : 'race';
      const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 500) : '';

      const payload = await performServerWebResearch({
        circuitId,
        circuitName,
        gameVersion,
        weather,
        sessionType,
        prompt,
      });

      res.json(payload);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Web research failed',
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RS Setups server listening on http://localhost:${PORT}`);
  });
}

startServer();
