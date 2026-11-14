import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const serverPort = Number(process.env.PORT ?? 3001);

export default defineConfig(({ mode }) => ({
  root: 'client',
  // `npm run dev` serves over HTTPS with a self-signed certificate: phones and other computers
  // only allow the microphone (voice chat) on secure pages. `npm run dev:http` skips it.
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
    },
  },
  test: { root: '.', include: ['tests/**/*.test.ts'] },
}) as never);
