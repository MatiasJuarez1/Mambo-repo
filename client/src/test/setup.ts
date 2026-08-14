// Setup global de los tests: registra los matchers de jest-dom
// (`toBeInTheDocument`, `toHaveTextContent`, ...) en el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'

// jsdom no implementa el scroll y escupe "Not implemented: Window's scrollTo()" en
// cada test que renderice algo que navegue. Se reemplaza por un espía vacío para no
// tapar la salida; los tests que necesitan verificarlo lo pisan con el suyo.
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
