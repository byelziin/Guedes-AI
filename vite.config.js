import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const frontendPort = Number.parseInt(String(env.VITE_FRONTEND_PORT || '5173').trim(), 10);
  const backendTarget = String(env.VITE_BACKEND_URL || 'http://localhost:3000').trim();
  const basePath = String(env.VITE_BASE || '/').trim();

  return {
    plugins: [react()],
    base: basePath,
    server: {
      host: true,
      port: Number.isFinite(frontendPort) ? frontendPort : 3000,
      strictPort: true,
      proxy: {
        '/socket.io': {
          target: backendTarget,
          ws: true,
        },
        '/status': {
          target: backendTarget,
        },
        '/api': {
          target: backendTarget,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
    },
  };
});
