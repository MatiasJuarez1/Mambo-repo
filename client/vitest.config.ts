import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Config de tests. Reutiliza la config de Vite (plugin de React, alias, etc.)
// para que los tests de componentes se compilen igual que la app.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // jsdom da un DOM falso para poder renderizar componentes con Testing Library.
      environment: 'jsdom',
      // `describe` / `it` / `expect` disponibles sin importar (ver "types" en tsconfig.json).
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
)
