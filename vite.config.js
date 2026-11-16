import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({ input: 'resources/js/main.jsx', refresh: true }),
        react(),
    ],
    build: {
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    // PDF export (jsPDF + html2canvas) is lazy-loaded on demand, never part of first load.
                    if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf-export';
                    if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react';
                    return undefined;
                },
            },
        },
    },
    server: { watch: { ignored: ['**/storage/framework/views/**'] } },
});
