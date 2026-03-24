import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
export default defineConfig({
    base: '/immureach-dashboard/',
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@data': path.resolve(__dirname, './data'),
        },
    },
    assetsInclude: ['**/*.geojson'],
});
