# Documentación de Estilos y Desplazamiento (UI/UX)

Este directorio contiene las hojas de estilo principales de la aplicación Frontend Comandas:
- `crear-ordenes.css`: Estilos para la vista de creación y gestión de órdenes/comandas.
- `index.css`: Variables globales, tipografía y estilos base de la aplicación.
- `App.css`: Estilos de maquetación general, layouts y componentes globales.
- `Login.css`: Estilos específicos de la pantalla de inicio de sesión.

---

## 📱 Gestión del Desplazamiento y Scroll Táctil (`crear-ordenes.css`)

### 1. Ajuste Dinámico y Auto-Scroll al Enfocar Buscador (`.search-active`)
Para garantizar una experiencia óptima en tablets y dispositivos móviles cuando el mesero utiliza la barra de búsqueda de productos:
* **Desplazamiento Automático Hacia Arriba (Auto-Scroll smooth):** Al enfocar el input de búsqueda (`onFocus`), se dispara `tabsNavbarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })` tras un breve retardo (80ms), desplazando automáticamente la vista hacia arriba para centrar la zona de trabajo.
* **Colapso de Cabecera:** Al enfocar el buscador, la clase `.search-active` se activa en la página principal y oculta la cabecera (`.co-header { display: none !important; }`), ganando espacio vertical significativo.
* **Recálculo de Altura Útil:** El contenedor de productos (`.co-products-scroll`) ajusta automáticamente su altura disponible a `max-height: calc(100vh - 110px) !important;`.
* **Beneficio:** Evita que el teclado táctil de Android/iOS oculte la caja de búsqueda o la lista de resultados, manteniendo el catálogo totalmente visible y desplazable al escribir.


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

### 4. Tarjeta Unificada Continua Sin Cortes (`.co-unified-main-card`)
Para lograr una estética visual homogénea, limpia y moderna en todos los módulos (`Inicio`, `Crear Órdenes`, `Órdenes Abiertas` y `Pedidos Pendientes`):
* **Contenedor Único Continuo:** Se envuelven la cabecera (`.co-header`), los filtros (`.co-filters-strip`), las pestañas (`.co-tabs-navbar`) y el cuerpo principal en una sola tarjeta contenedora blanca (`.co-unified-main-card`).
* **Eliminación de Cortes Grises:** Se suprimen los bordes exteriores individuales y los espacios en blanco/gris entre secciones, integrándolas con líneas divisorias finas internas (`border-bottom: 1px solid #e2e8f0`).
* **Consistencia Visual:** Evita saltos horizontales o desplazamientos de píxeles al navegar entre pestañas, manteniendo exactamente la misma grilla y márgenes en toda la app.


---

## 🎨 Principios de Diseño
- **Diseño Responsivo:** Adaptación fluida mediante `@media (max-width: 767px)`.
- **Micro-interacciones:** Transiciones suaves de `0.15s` en botones, filas de carrito y tarjetas de producto.
- **Paleta de Colores:** Rojo institucional (`#e31b23`), tonos slate para textos e intensidad de contrastes legibles en ambientes de alta luz (restaurantes/bar).
