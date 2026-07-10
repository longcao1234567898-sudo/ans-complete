import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cấu hình Vite cho dự án React + TypeScript
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, open: true },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Tách vendor thành các chunk riêng để tối ưu tải trang
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-motion': ['framer-motion'],
          // qrcode.react (sinh QR, nhỏ) tách riêng; html5-qrcode (quét QR, ~300KB)
          // KHÔNG liệt kê ở đây để Vite tự tách thành chunk lazy — chỉ tải khi bấm quét
          'vendor-qrgen': ['qrcode.react'],
        },
      },
    },
  },
});
