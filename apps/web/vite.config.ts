import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const isProduction = mode === 'production';
    const apiTarget = isProduction 
        ? 'https://api-cantina.neurelix.com.br' 
        : 'http://localhost:3000';

    return {
        plugins: [
            react(),
            VitePWA({
                registerType: 'autoUpdate',
                manifest: {
                    name: 'Cantina',
                    short_name: 'Cantina',
                    description: 'Sistema de cantina universitária',
                    theme_color: '#5d4037',
                    background_color: '#fdfaf7',
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
                    target: apiTarget,
                    changeOrigin: true,
                },
                '/uploads': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
            allowedHosts: [
                'https://api-cantina.neurelix.com.br',
                'https://cantina.neurelix.com.br',
            ]
        },
        resolve: {
            alias: {
                '@cantina/shared': '../../packages/shared/src/index.ts',
            },
        },
    };
});
