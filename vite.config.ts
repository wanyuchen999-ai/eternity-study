import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages 项目站点部署在 /<仓库名>/ 子路径下，由 CI 环境变量指定
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      // 忽略项目里其他子项目/浏览器缓存目录，避免监听到被占用的文件导致崩溃
      ignored: ['**/food-map/**', '**/.edge/**', '**/GPUPersistentCache/**'],
    },
  },
})
