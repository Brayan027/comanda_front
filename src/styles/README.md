# Documentación de Estilos y Desplazamiento (UI/UX)

Este directorio contiene las hojas de estilo principales de la aplicación Frontend Comandas:
- `crear-ordenes.css`: Estilos para la vista de creación y gestión de órdenes/comandas.
- `index.css`: Variables globales, tipografía y estilos base de la aplicación.
- `App.css`: Estilos de maquetación general, layouts y componentes globales.
- `Login.css`: Estilos específicos de la pantalla de inicio de sesión.

---

## 📱 Gestión del Desplazamiento y Scroll Táctil (`crear-ordenes.css`)

### 1. Ajuste Dinámico al Desplegar Teclado Móvil (`.search-active`)
Para garantizar una experiencia óptima en tablets y dispositivos móviles cuando el mesero utiliza la barra de búsqueda de productos:
* **Colapso de Cabecera:** Al enfocar el buscador, la clase `.search-active` se activa en la página principal y oculta la cabecera (`.co-header { display: none !important; }`).
* **Recálculo de Altura Útil:** El contenedor de productos (`.co-products-scroll`) ajusta automáticamente su altura disponible a `max-height: calc(100vh - 110px) !important;`.
* **Beneficio:** Permite al usuario desplazarse por el catálogo de productos con la pantalla visible optimizada sin que el teclado virtual tape los resultados ni distorsione el layout.

### 2. Personalización de Barras de Scroll (Scrollbars Discretas)
Para mantener una apariencia estética limpia y moderna:
* Ancho compacto (6px) para evitar intrusiones en la interfaz táctil.
* `track` transparente con `thumb` redondeado de color neutro (`#cbd5e1`) que se oscurece al pasar el cursor (`#94a3b8`).
* Aplicado uniformemente a:
  - Catálogo de productos (`.co-products-grid`)
  - Carrito de compras (`.co-cart-scroll`)
  - Ventanas modales (`.modal-body-premium`)
  - Desplegable de meseros (`.co-waiters-dropdown`)

### 3. Aislamiento de Scroll por Contenedores (Scroll Containment)
* Cada columna de la vista (Catálogo, Carrito y Factura) posee su propio contenedor con `overflow-y: auto`.
* Se evita el scroll global de la ventana (`body` o `window`), impidiendo rebotes elásticos indeseados en iOS/Android y asegurando que las listas largas mantengan el encabezado visible mientras se desplaza el contenido.

---

## 🎨 Principios de Diseño
- **Diseño Responsivo:** Adaptación fluida mediante `@media (max-width: 767px)`.
- **Micro-interacciones:** Transiciones suaves de `0.15s` en botones, filas de carrito y tarjetas de producto.
- **Paleta de Colores:** Rojo institucional (`#e31b23`), tonos slate para textos e intensidad de contrastes legibles en ambientes de alta luz (restaurantes/bar).
