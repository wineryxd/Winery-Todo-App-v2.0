import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export const Winery = true

export default defineConfig({
  plugins: [react()],
})
