# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# comanda_front

## 🎨 Estilos y Gestión del Desplazamiento (Scroll UI/UX)

Para consultar la documentación técnica completa de estilos y comportamiento de desplazamiento, revisa el archivo [src/styles/README.md](file:///c:/Users/acer/Desktop/TRABAJOS/DIANASIS/comandas/Frontend_comanda/src/styles/README.md).

### Resumen del Comportamiento de Desplazamiento:
1. **Modo Búsqueda y Auto-Scroll en Móviles (`.search-active`):** Al hacer clic/enfocar en la barra de búsqueda en móviles, el sistema ejecuta un desplazamiento suave automático (`scrollIntoView` smooth a las pestañas), oculta la cabecera principal y ajusta la altura disponible (`max-height: calc(100vh - 110px)`). Esto permite buscar y scrollear productos cómodamente sin que el teclado en pantalla limite o tape la visual.

2. **Scrollbars Personalizadas y Discretas:** Implementadas en `.co-products-grid`, `.co-cart-scroll` y modales con un ancho estilizado de 6px y animación en hover.
3. **Aislamiento de Scroll (Containment):** Scroll independiente por columna para prevenir desplazamientos elásticos indeseados en la pantalla completa.

