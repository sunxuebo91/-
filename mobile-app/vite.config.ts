import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

// App(Capacitor)打包用相对路径 './'(资源以 file://https://localhost 根加载);
// web 版保持 '/mobile/'。通过 CAP_BUILD 环境变量区分(见 npm run build:android)。
const isCapBuild = process.env.CAP_BUILD === '1' || process.env.CAP_BUILD === 'true'
const rawBuildFingerprint = process.env.VITE_BUILD_FINGERPRINT?.trim() || ''
const buildFingerprint = /^[a-f0-9]{16}$/i.test(rawBuildFingerprint) ? rawBuildFingerprint : 'untracked'

export default defineConfig({
  base: isCapBuild ? './' : '/mobile/',
  plugins: [
    react(),
    {
      name: 'app-build-fingerprint',
      transformIndexHtml(html) {
        return html.replace('<head>', `<head>\n    <meta name="app-build-fingerprint" content="${buildFingerprint}">`)
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 基础分包:react 全家桶 / antd-mobile / 工具库
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('antd-mobile') || id.includes('@react-spring') || id.includes('rc-')) {
            return 'antd-mobile'
          }
          if (
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor'
          }
          if (id.includes('zustand') || id.includes('axios') || id.includes('dayjs')) {
            return 'utils-vendor'
          }
          // react-query / react-virtual 独立分包，与页面代码解耦
          if (id.includes('@tanstack')) {
            return 'tanstack-vendor'
          }
        },
      },
    },
  },
})
