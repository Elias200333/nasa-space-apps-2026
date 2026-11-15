import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/output_3d': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      // Backend del robot (python -m terrainx_robot dashboard, solo 127.0.0.1:8777).
      // xfwd añade la IP real del cliente: desde las gafas u otro equipo el robot pide su
      // código de emparejamiento; desde este PC, no.
      '/robot': {
        target: 'http://127.0.0.1:8777',
        ws: true,
        xfwd: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});

