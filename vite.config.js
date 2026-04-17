import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Change 'ferro-kalkulator' to your GitHub repo name
  base: '/ferro-kalkulator/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist'
  }
})
