import { app } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './database/migrate.js';
import { runSeed } from './database/seed.js';

async function bootstrap() {
  try {
    console.log('[Bootstrap] Initializing Meri DBU Student platform...');
    await runMigrations();
    await runSeed();

    const server = app.listen(env.PORT, () => {
      console.log(`[Server] =================================================`);
      console.log(`[Server] Meri DBU Student Platform is LIVE!`);
      console.log(`[Server] Institution: Debre Berhan University (DBU)`);
      console.log(`[Server] URL: http://localhost:${env.PORT}`);
      console.log(`[Server] Health Check: http://localhost:${env.PORT}/api/v1/health`);
      console.log(`[Server] Environment: ${env.NODE_ENV}`);
      console.log(`[Server] =================================================`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('[Server] SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('[Server] Process terminated.');
      });
    });
  } catch (err) {
    console.error('[Bootstrap] Failed to start server:', err);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('server')) {
  bootstrap();
}
