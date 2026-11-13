import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const serverPort = Number(process.env.PORT ?? 3001);

export default defineConfig(({ mode }) => ({
  root: 'client',
  // `npm run dev:https` serves over HTTPS with a self-signed certificate, which phones and
  // other computers need before a browser will allow the microphone for voice chat.
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
