import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit(),
        SvelteKitPWA({
            srcDir: './src',
            mode: 'development',
            strategies: 'generateSW',
            registerType: 'autoUpdate',
            manifest: {
                name: 'Cyanki Study Platform',
                short_name: 'Cyanki',
                description: 'Continuous Learning Ecosystem',
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                // UC-02: Precache all static UI assets (JS bundles, CSS, icons, HTML shells).
                // These land in the Cache API and are served instantly offline.
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

                // UC-02: Runtime caching strategies for requests that are NOT in the
                // precache manifest (dynamic URLs resolved at runtime).
                runtimeCaching: [
                    // Google Fonts stylesheet — long-lived, rarely changes
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    // Google Fonts binaries (woff2) — same policy
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-files-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    // Backend API — NetworkFirst: always try the network for fresh data,
                    // fall back to cached response if offline (read-only offline resilience).
                    // Dynamic media Blobs are handled separately by mediaCache.ts / IndexedDB.
                    {
                        urlPattern: /\/api\//,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-cache',
                            networkTimeoutSeconds: 10,
                            expiration: {
                                maxEntries: 64,
                                maxAgeSeconds: 60 * 5 // 5 minutes — safety net only
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    // External images referenced in flashcard/notebook content — CacheFirst
                    // so that images load instantly offline after the first visit.
                    // Note: large/dynamic media is also stored as Blobs in IndexedDB by
                    // mediaCache.ts for fine-grained control; this handles the Cache API layer.
                    {
                        urlPattern: /\.(?:png|jpe?g|gif|svg|webp|avif)(\?.*)?$/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'image-assets-cache',
                            expiration: {
                                maxEntries: 150,
                                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    }
                ]
            }
        })
    ],
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
        environment: 'jsdom',
        setupFiles: ['./vitest-setup.ts'],
    }
});
