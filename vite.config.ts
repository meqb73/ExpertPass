import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { expertPassApi } from './server/vite-plugin'

export default defineConfig(({ mode }) => ({
  // Pin the project root so the app works no matter which directory the dev server is started from.
  root: __dirname,
  plugins: [
    react(),
    nodePolyfills(),
    expertPassApi(loadEnv(mode, __dirname, ''), path.resolve(__dirname, 'data')),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      '@web3icons/react',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  preview: {
    allowedHosts: true,
  },
  server: {
    allowedHosts: true,
    cors: true,
  },
}))
