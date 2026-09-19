import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Ahora se sirve en la raiz de su propio subdominio (coffitproduccion.saboryaroma.com),
  // ya no en una subcarpeta del sitio principal.
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})
