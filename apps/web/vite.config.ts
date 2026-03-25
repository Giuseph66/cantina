import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'Cantina',
                short_name: 'Cantina',
                description: 'Sistema de cantina universitária',
                theme_color: '#6366f1',
                background_color: '#0f172a',
                display: 'standalone',
                start_url: '/',
                icons: [
                    {
                        src: '/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
        }),
    ],
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000', //https://umbonate-theda-conterminously.ngrok-free.dev
                changeOrigin: true,
            },
            '/uploads': {
                target: 'http://localhost:3000', //https://umbonate-theda-conterminously.ngrok-free.dev
                changeOrigin: true,
            },
        },
        allowedHosts: [
            'umbonate-theda-conterminously.ngrok-free.dev'
        ]
    },
    resolve: {
        alias: {
            '@cantina/shared': '../../packages/shared/src/index.ts',
        },
    },
});
