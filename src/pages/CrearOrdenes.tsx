import { useEffect, useState, useRef, useMemo } from "react";
import { 
  FiMinus, 
  FiPlus, 
  FiSearch, 
  FiTrash2, 
  FiUser, 
  FiLayers, 
  FiGrid,
  FiX,
  FiList,
  FiCheck,
  FiEdit,
  FiArrowLeft
} from "react-icons/fi";
import { Modal, Button, Badge } from "react-bootstrap";
import Swal from "sweetalert2";
import { API_BASE_URL, sanitizarError, getTerminalId, isMandatoryPrintEnabled, apiFetch } from "../config/api";
import { storage } from "../utils/storage";
import "../styles/crear-ordenes.css";



// Interfaces de TypeScript
interface Waiter {
  id: string;
  nombre: string;
  codigo?: string;
}

interface Product {
  ProIdInProducto: number;
  ProStDescripcion: string;
  ProIdInPresentacion: number;
  ProIdInUnidadVenta: number;
  ProInPrecio: string | number;
  precioVenta: number;
  ProInCosto: string | number;
  ProInIva?: string | number;
  ProInIvaVenta?: string | number;
  ProInPorcentajeImpoconsumo?: string | number;
  ProStIvaIncluido?: string | number;
  ExiInCantidadFinalBodega: number;
  PreStAbreviatura: string;
  ImpNombre1?: string;
}

interface AccompanimentOption {
  ApmIdInProducto: number;
  ProStDescripcion: string;
  ApmStIncrementaPrecio: string;
  ApmInValorFijo: number;
}

interface SelectionGroup {
  CprIdInAdicionales: number;
  AprStDescripcion: string;
  CprInOrden: number;
  CprInCantidad: number; // Cantidad máxima permitida para seleccionar
  CprStObligatorio?: string;
  acompanantes: AccompanimentOption[];
}

interface CartItem {
  idUnicoCart: string; // ID único para manejar duplicados de productos con diferentes acompañamientos
  ProIdInProducto: number;
  ProStDescripcion: string;
  precioVenta: number;
  cantidad: number;
  ProIdInUnidadVenta: number;
  ProInCosto: number;
  ProInIvaVenta?: number;
  ProInPorcentajeImpoconsumo?: number;
  ProStIvaIncluido?: string | number;
  MopStImpreso?: string;
  ImpNombre1?: string;
  observacion?: string;
  esEliminado?: boolean;
  adicionales: {
    ApmIdInProducto: number;
    ProStDescripcion: string;
    precioVenta: number;
    cantidad: number;
  }[];
}

interface SelectedSideItem {
  ApmIdInProducto: number;
  ProStDescripcion: string;
  precioVenta: number;
  cantidad: number;
  ApmStIncrementaPrecio: string;
  ApmInValorFijo: number;
}

type VistaMovil = "productos" | "carrito" | "factura";

interface CrearOrdenesProps {
  initialOrdenId?: string | number | null;
  onClearInitial?: () => void;
  onRegisterNavigationCheck?: (checkFn: (() => Promise<boolean>) | null) => void;
}

export default function CrearOrdenes({ initialOrdenId, onClearInitial, onRegisterNavigationCheck }: CrearOrdenesProps = {}) {
  // Detalles de sesión obtenidos de localStorage (usando wrapper aislado storage)
  const infoPuntoVenta = (() => {
    try {
      const stored = storage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const loggedVendedor = (() => {
    try {
      const stored = storage.getItem("vendedor");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const loggedUsuario = (() => {
    try {
      const stored = storage.getItem("usuario");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const esAdministrador = useMemo(() => {
    return loggedUsuario?.UsuStIdGrupoUsuario === "ADMS" || loggedUsuario?.UsuStIdGrupoUsuario === "ADM";
  }, [loggedUsuario]);

  // Terminal ID estable y permanente para este dispositivo (nunca cambia entre recargas)
  const terminalName = useMemo(() => getTerminalId(), []);
  const [mandatoryPrint, setMandatoryPrint] = useState(() => isMandatoryPrintEnabled());

  useEffect(() => {
    const handleConfigChange = () => {
      setMandatoryPrint(isMandatoryPrintEnabled());
    };
    window.addEventListener("config_impresion_cambiada", handleConfigChange);
    window.addEventListener("storage", handleConfigChange);
    return () => {
      window.removeEventListener("config_impresion_cambiada", handleConfigChange);
      window.removeEventListener("storage", handleConfigChange);
    };
  }, []);

  const token = storage.getItem("token") || "";

  
  const comanderaBloqueada = useMemo(() => {
    return storage.getItem("comanderaBloqueada") === "true";
  }, []);

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(storage.getItem("puntoVenta") || infoPuntoVenta?.PveIdInPuntoVenta || "2"),
    "terminal": terminalName
  }), [token, infoPuntoVenta, terminalName]);

  // Variables de estado
  const [mesa, setMesa] = useState("");
  const [ordenId, setOrdenId] = useState<string | number | null>(null);
  const [errorImpresora, setErrorImpresora] = useState<string | null>(null);
  
  // Estado para el autocompletado de meseros
  const [meseroBusqueda, setMeseroBusqueda] = useState("");
  const [mesero, setMesero] = useState<Waiter | null>(null);
  const [waitersSuggestions, setWaitersSuggestions] = useState<Waiter[]>([]);
  const [showWaitersList, setShowWaitersList] = useState(false);

  const [numPersonas, setNumPersonas] = useState<number | string>(1);
  const [vistaMovil, setVistaMovil] = useState<VistaMovil>("productos");
  
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [productos, setProductos] = useState<Product[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [cargandoComanda, setCargandoComanda] = useState(false);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  
  const [cabeceraConfirmada, setCabeceraConfirmada] = useState(false);
  
  // Selectores de cantidad rápida por tarjeta de producto
  const [cantidadesRapidas, setCantidadesRapidas] = useState<Record<number, number | string>>({});
  const [obsPredefinidas, setObsPredefinidas] = useState<any[]>([]);
  const [lineas, setLineas] = useState<{ id: number; descripcion: string }[]>([]);
  const [lineaSeleccionada, setLineaSeleccionada] = useState<number | null>(null);
  const [subTabProductos, setSubTabProductos] = useState<"productos" | "categorias">("productos");

  // Modales
  const [modalSidesOpen, setModalSidesOpen] = useState(false);
  const [modalProductQty, setModalProductQty] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [availableSides, setAvailableSides] = useState<SelectionGroup[]>([]);
  const [selectedSides, setSelectedSides] = useState<Record<number, SelectedSideItem[]>>({}); // Indexado por ID del grupo de selección (SelectionGroup)
  const [currentSideGroupIndex, setCurrentSideGroupIndex] = useState(0);



  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchSwiped = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchSwiped.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null || touchSwiped.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;

    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Cambiar de pestaña al deslizar horizontalmente (mínimo 60px y movimiento horizontal puro)
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 2.5) {
      touchSwiped.current = true;
      if (diffX < 0) {
        // Deslizar hacia la izquierda -> Siguiente pestaña (PRODUCTOS -> CARRITO -> PEDIDO)
        setVistaMovil(prev => {
          if (prev === "productos") return "carrito";
          if (prev === "carrito") return "factura";
          return prev;
        });
      } else {
        // Deslizar hacia la derecha -> Pestaña anterior (PEDIDO -> CARRITO -> PRODUCTOS)
        setVistaMovil(prev => {
          if (prev === "factura") return "carrito";
          if (prev === "carrito") return "productos";
          return prev;
        });
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;
    touchSwiped.current = false;
  };

  const [guardando, setGuardando] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabsNavbarRef = useRef<HTMLElement>(null);
  const productSearchTimeout = useRef<number | undefined>(undefined);

  const fetchObservacionesPredefinidas = async () => {
    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/observaciones-predefinidas`, {
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        setObsPredefinidas(resData.body || []);
      }
    } catch (e) {
      console.error("Error loading observations", e);
    }
  };

  const fetchLineas = async () => {
    try {
      const resp = await apiFetch(`${API_BASE_URL}/productos/lineas`, {
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        const lista: { id: number; descripcion: string }[] = resData.body || [];
        lista.sort((a, b) => (a.descripcion || "").localeCompare(b.descripcion || "", "es", { sensitivity: "base" }));
        setLineas(lista);
      }
    } catch (e) {
      console.error("Error loading product lines", e);
    }
  };

  const liberarMesaActual = async (mesaTarget?: string) => {
    const target = (mesaTarget || mesa || "").trim();
    if (!target) return;
    try {
      await apiFetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ mesa: target })
      });
    } catch (e) {
      console.error("Error al liberar mesa:", e);
    }
  };

  const mesaRef = useRef(mesa);
  const ordenIdRef = useRef(ordenId);
  useEffect(() => {
    mesaRef.current = mesa;
    ordenIdRef.current = ordenId;
  }, [mesa, ordenId]);

  useEffect(() => {
    const handleSendBeacon = () => {
      const target = mesaRef.current || ordenIdRef.current;
      const term = getTerminalId();
      let info: any = {};
      try {
        info = JSON.parse(storage.getItem("infoPuntoVenta") || "{}");
      } catch (e) {}

      const payload = JSON.stringify({
        mesa: target ? String(target) : "",
        terminal: term,
        empresa: info?.PveIdStEmpresa || "02",
        punto: String(info?.PveIdInPuntoVenta || "5")
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(`${API_BASE_URL}/ordenes/mesa/cerrar-beacon`, blob);
      }
    };

    window.addEventListener("pagehide", handleSendBeacon);
    window.addEventListener("beforeunload", handleSendBeacon);

    return () => {
      window.removeEventListener("pagehide", handleSendBeacon);
      window.removeEventListener("beforeunload", handleSendBeacon);
      const target = mesaRef.current || ordenIdRef.current;
      if (target) {
        liberarMesaActual(String(target));
      }
    };
  }, []);

  // Conteo de productos sin imprimir
  const sinImprimirCount = useMemo(() => {
    return carrito.filter(item => String(item.MopStImpreso || '0') !== '1' && !item.esEliminado).length;
  }, [carrito]);

  // Carrito ordenado: productos NO IMPRESOS primero (arriba), impresos después, eliminados al final
  const carritoOrdenado = useMemo(() => {
    return [...carrito].sort((a, b) => {
      const aImpreso = String(a.MopStImpreso || '0') === '1';
      const bImpreso = String(b.MopStImpreso || '0') === '1';
      const aEliminado = Boolean(a.esEliminado);
      const bEliminado = Boolean(b.esEliminado);

      if (aEliminado !== bEliminado) return aEliminado ? 1 : -1;
      if (aImpreso !== bImpreso) return aImpreso ? 1 : -1;
      return 0;
    });
  }, [carrito]);

  // Alerta de confirmación al salir/recargar si HAY productos sin imprimir en el carrito
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sinImprimirCount > 0) {
        const text = `Tiene ${sinImprimirCount} ${sinImprimirCount === 1 ? 'producto sin imprimir' : 'productos sin imprimir'}. ¿Desea salir?`;
        e.preventDefault();
        e.returnValue = text;
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sinImprimirCount]);

  const sinImprimirCountRef = useRef(0);
  useEffect(() => {
    sinImprimirCountRef.current = sinImprimirCount;
  }, [sinImprimirCount]);

  useEffect(() => {
    if (!onRegisterNavigationCheck) return;

    const checkFn = async (): Promise<boolean> => {
      const count = sinImprimirCountRef.current;
      if (count > 0) {
        const text = `Tiene ${count} ${count === 1 ? 'producto sin imprimir' : 'productos sin imprimir'}. ¿Desea salir?`;
        const result = await Swal.fire({
          icon: "warning",
          title: "Productos sin imprimir",
          text,
          showCancelButton: true,
          confirmButtonColor: "#ef4444",
          cancelButtonColor: "#64748b",
          confirmButtonText: "Sí, salir",
          cancelButtonText: "Cancelar"
        });

        if (result.isConfirmed) {
          // El usuario confirmó descartar los productos sin guardar/imprimir
          localStorage.removeItem("comanda_draft_cart");
          if (mesaRef.current) {
            liberarMesaActual(String(mesaRef.current));
          }
          setCarrito([]);
          setMesa("");
          setOrdenId(null);
          setCabeceraConfirmada(false);
          return true;
        }
        return false;
      }
      return true;
    };

    onRegisterNavigationCheck(checkFn);
    return () => {
      onRegisterNavigationCheck(null);
    };
  }, [onRegisterNavigationCheck]);

  // Restaurar borrador de carrito de localStorage si no viene una comanda inicial
  useEffect(() => {
    if (!initialOrdenId) {
      try {
        const savedDraft = localStorage.getItem("comanda_draft_cart");
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed && Array.isArray(parsed.carrito) && parsed.carrito.length > 0) {
            setCarrito(parsed.carrito);
            if (parsed.mesa) setMesa(parsed.mesa);
            if (parsed.mesero) setMesero(parsed.mesero);
            if (parsed.numPersonas) setNumPersonas(parsed.numPersonas);
            if (parsed.ordenId) setOrdenId(parsed.ordenId);
            if (parsed.cabeceraConfirmada !== undefined) setCabeceraConfirmada(parsed.cabeceraConfirmada);
          }
        }
      } catch (e) {
        console.error("Error al recuperar borrador del carrito:", e);
      }
    }
  }, [initialOrdenId]);

  // Persistir borrador del carrito en localStorage al cambiar
  useEffect(() => {
    if (initialOrdenId) return;
    if (carrito.length > 0) {
      try {
        const draft = {
          carrito,
          mesa,
          mesero,
          numPersonas,
          ordenId,
          cabeceraConfirmada
        };
        localStorage.setItem("comanda_draft_cart", JSON.stringify(draft));
      } catch (e) {
        console.error("Error al guardar borrador en localStorage:", e);
      }
    } else {
      localStorage.removeItem("comanda_draft_cart");
    }
  }, [carrito, mesa, mesero, numPersonas, ordenId, cabeceraConfirmada, initialOrdenId]);

  useEffect(() => {
    if (loggedVendedor) {
      const w = {
        id: loggedVendedor.CliNit,
        nombre: loggedVendedor.CliStNombreCliente,
        codigo: loggedVendedor.CliStCodigoBanco
      };
      setMesero(w);
      const displayVal = w.codigo 
        ? `${w.codigo} - ${w.nombre.toUpperCase()}`
        : `${w.id} - ${w.nombre.toUpperCase()}`;
      setMeseroBusqueda(displayVal);
    }
    fetchWaiters("");
    fetchObservacionesPredefinidas();
    fetchLineas();
  }, []);

  // Cargar la comanda inicial si se pasa un ID de orden como prop
  useEffect(() => {
    if (initialOrdenId) {
      const loadComanda = async () => {
        setCargandoComanda(true);
        try {
          const resp = await apiFetch(`${API_BASE_URL}/ordenes/${initialOrdenId}`, {
            method: "GET",
            headers
          });

          if (resp.ok) {
            const resData = await resp.json();
            const comanda = resData.body;
            
            if (comanda) {
              setMesa(comanda.OpeStMesa || "");
              setOrdenId(comanda.OpeIdInOrdenPedido);
              setNumPersonas(comanda.OpeInNumPersonas || 1);

              if (comanda.OpeStMesa) {
                apiFetch(`${API_BASE_URL}/ordenes/mesa/abrir`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ mesa: comanda.OpeStMesa, terminal: terminalName })
                }).catch(e => console.error("Error al abrir mesa en loadComanda:", e));
              }
              
              if (comanda.OpeIdStVendedor) {
                const waiterInfo = {
                  id: comanda.OpeIdStVendedor,
                  nombre: comanda.NombreVendedor || "Mesero Cargado",
                  codigo: comanda.CodigoVendedor
                };
                setMesero(waiterInfo);
                const displayVal = waiterInfo.codigo 
                  ? `${waiterInfo.codigo} - ${waiterInfo.nombre.toUpperCase()}`
                  : `${waiterInfo.id} - ${waiterInfo.nombre.toUpperCase()}`;
                setMeseroBusqueda(displayVal);
              }

              const itemsFormateados = comanda.productos.map((p: any) => {
                const adicionales = (p.adicionales || []).map((ad: any) => ({
                  ApmIdInProducto: ad.ApmIdInProducto,
                  ProStDescripcion: ad.ProStDescripcion,
                  precioVenta: ad.precioVenta,
                  cantidad: ad.cantidad || 1
                }));

                const sidesKey = adicionales
                  .map((ad: any) => ad.ApmIdInProducto)
                  .sort()
                  .join(",");
                const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}_imp_${p.MopInItem || Math.random()}`;
                const descCompleta = p.ProStDescripcion || "";
                const parts = descCompleta.split(" - ");
                const nombreOriginal = parts[0];
                const observacion = parts.slice(1).join(" - ");

                return {
                  idUnicoCart,
                  ProIdInProducto: p.ProIdInProducto,
                  ProStDescripcion: nombreOriginal,
                  precioVenta: p.valor,
                  cantidad: p.cantidad,
                  ProIdInUnidadVenta: p.MopIdInUnidadVenta || 1,
                  ProInCosto: p.MopInCosto || 0,
                  ProInIvaVenta: p.MopInPorIva || 0,
                  ProInPorcentajeImpoconsumo: p.MopInPorcentajeImpoconsumo || 0,
                  ProStIvaIncluido: p.MopInPorIva > 0 || p.MopInPorcentajeImpoconsumo > 0 ? "1" : "0",
                  MopStImpreso: String(p.MopStImpreso || '0'),
                  ImpNombre1: p.ImpNombre1 || "Comanda General",
                  adicionales,
                  observacion: observacion || ""
                };
              });

              setCarrito(itemsFormateados);
              setCabeceraConfirmada(true);
            }
          }
        } catch (e) {
          console.error("Error loading initial comanda by ID", e);
        } finally {
          setCargandoComanda(false);
          // NO llamar onClearInitial aquí — eso desmontaría el componente antes de que el usuario edite
        }
      };
      loadComanda();
    }
  }, [initialOrdenId]);

  // Obtener la lista de productos al cambiar el término de búsqueda o categoría (con Debounce)
  useEffect(() => {
    if (cargandoComanda) return; // Evitar consultas pesadas en paralelo a la base de datos mientras carga la comanda
    if (productSearchTimeout.current) clearTimeout(productSearchTimeout.current);
    productSearchTimeout.current = setTimeout(cargarProductos, 200);

    return () => {
      if (productSearchTimeout.current) clearTimeout(productSearchTimeout.current);
    };
  }, [busquedaProducto, lineaSeleccionada, cargandoComanda]);

  // Cargar las sugerencias de autocompletado de meseros
  const fetchWaiters = async (term: string) => {
    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/waiters?search=${encodeURIComponent(term)}`, {
        method: "GET",
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        setWaitersSuggestions(resData.body || []);
      }
    } catch (e) {
      console.error("Error cargando meseros", e);
    }
  };

  const handleMeseroChange = (val: string) => {
    setMeseroBusqueda(val);
    if (!val.trim()) {
      setMesero(null);
      setWaitersSuggestions([]);
      setShowWaitersList(false);
      return;
    }
    setShowWaitersList(true);
    fetchWaiters(val);
  };

  const selectMesero = (w: Waiter) => {
    setMesero(w);
    const displayVal = w.codigo 
      ? `${w.codigo} - ${w.nombre.toUpperCase()}`
      : `${w.id} - ${w.nombre.toUpperCase()}`;
    setMeseroBusqueda(displayVal);
    setShowWaitersList(false);
  };

  const limpiarMesero = () => {
    setMesero(null);
    setMeseroBusqueda("");
    setWaitersSuggestions([]);
    setShowWaitersList(false);
  };

  // Cargar productos basados en el término de búsqueda
  const cargarProductos = async () => {
    try {
      setCargandoProductos(true);
      const limit = 50;
      let url = `${API_BASE_URL}/ordenes/productos?search=${encodeURIComponent(busquedaProducto)}&limit=${limit}`;
      if (lineaSeleccionada !== null) {
        url += `&linea=${lineaSeleccionada}`;
      }
      const resp = await apiFetch(url, {
        method: "GET",
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        setProductos(resData.body?.items || []);
      }
    } catch (e) {
      console.error("Error cargando productos", e);
    } finally {
      setCargandoProductos(false);
    }
  };

  // Verificar si la mesa tiene una comanda/orden abierta
  const verificarMesa = async (): Promise<boolean> => {
    if (!mesa.trim()) return false;

    const sinFecha = storage.getItem("sinFechaTrabajo") === "true";
    if (sinFecha) {
      Swal.fire({
        icon: "error",
        title: "⚠️ Configurar Fecha de Trabajo",
        text: "Debe configurar la fecha de trabajo en el sistema Dianasis para este punto de venta antes de registrar o modificar pedidos.",
        confirmButtonColor: "#ef4444",
        confirmButtonText: "Entendido",
        allowEnterKey: false
      });
      return false;
    }

    setCargandoComanda(true);
    try {
      const abrirResp = await apiFetch(`${API_BASE_URL}/ordenes/mesa/abrir`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mesa: mesa.trim(), terminal: terminalName })
      });

      if (abrirResp.status === 401) {
        setCargandoComanda(false);
        return false;
      }

      const abrirData = await abrirResp.json();
      if (!abrirResp.ok || abrirData.locked) {
        Swal.fire({
          icon: "warning",
          title: "🔒 Mesa Ocupada",
          text: "La mesa ya se encuentra abierta en otro dispositivo.",
          confirmButtonColor: "#ef4444",
          confirmButtonText: "Entendido"
        });
        setCargandoComanda(false);
        return false;
      }

      const resp = await apiFetch(`${API_BASE_URL}/ordenes/mesa/${encodeURIComponent(mesa.trim())}`, {
        method: "GET",
        headers
      });

      if (resp.ok) {
        const resData = await resp.json();
        const comanda = resData.body;
        
        if (comanda) {
          // Cargar comanda abierta de la fecha de trabajo actual para editar o adicionar productos
          setOrdenId(comanda.OpeIdInOrdenPedido);
          setNumPersonas(comanda.OpeInNumPersonas || 1);
          if (comanda.OpeIdStVendedor) {
            const waiterInfo = {
              id: comanda.OpeIdStVendedor,
              nombre: comanda.NombreVendedor || "Mesero",
              codigo: comanda.CodigoVendedor
            };
            setMesero(waiterInfo);
            const displayVal = waiterInfo.codigo 
              ? `${waiterInfo.codigo} - ${waiterInfo.nombre.toUpperCase()}`
              : `${waiterInfo.id} - ${waiterInfo.nombre.toUpperCase()}`;
            setMeseroBusqueda(displayVal);
          }

          const itemsFormateados = (comanda.productos || []).map((p: any) => {
            const adicionales = (p.adicionales || []).map((ad: any) => ({
              ApmIdInProducto: ad.ApmIdInProducto,
              ProStDescripcion: ad.ProStDescripcion,
              precioVenta: ad.precioVenta,
              cantidad: ad.cantidad || 1
            }));

            const sidesKey = adicionales.map((ad: any) => ad.ApmIdInProducto).sort().join(",");
            const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}_imp_${p.MopInItem || Math.random()}`;
            const descCompleta = p.ProStDescripcion || "";
            const parts = descCompleta.split(" - ");
            const nombreOriginal = parts[0];
            const observacion = parts.slice(1).join(" - ");

            return {
              idUnicoCart,
              ProIdInProducto: p.ProIdInProducto,
              ProStDescripcion: nombreOriginal,
              precioVenta: p.valor,
              cantidad: p.cantidad,
              ProIdInUnidadVenta: p.MopIdInUnidadVenta || 1,
              ProInCosto: p.MopInCosto || 0,
              ProInIvaVenta: p.MopInPorIva || 0,
              ProInPorcentajeImpoconsumo: p.MopInPorcentajeImpoconsumo || 0,
              ProStIvaIncluido: p.MopInPorIva > 0 || p.MopInPorcentajeImpoconsumo > 0 ? "1" : "0",
              MopStImpreso: String(p.MopStImpreso || '0'),
              ImpNombre1: p.ImpNombre1 || "Comanda General",
              adicionales,
              observacion: observacion || ""
            };
          });

          setCarrito(itemsFormateados);
          setCabeceraConfirmada(true);
          setVistaMovil("productos");

          Swal.fire({
            icon: "info",
            title: `Mesa ${mesa.trim()}`,
            text: `Orden #${comanda.OpeIdStDocumento} cargada. Puede adicionar productos.`,
            timer: 2500,
            showConfirmButton: false,
            toast: true,
            position: "top-end"
          });
          return true;
        }
      } else {
        // La mesa está libre
        setOrdenId(null);
        setCabeceraConfirmada(true);
        setVistaMovil("productos");
        Swal.fire({
          icon: "success",
          title: "Mesa Libre",
          text: `Iniciando nueva orden para la Mesa ${mesa.trim()}`,
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: "top-end"
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error verificando mesa", e);
      return false;
    } finally {
      setCargandoComanda(false);
    }
  };

  // Agregar un producto (verifica los modificadores primero)
  const addProductToCart = async (p: Product) => {
    const sinFecha = storage.getItem("sinFechaTrabajo") === "true";
    if (sinFecha) {
      Swal.fire({
        icon: "error",
        title: "⚠️ Configurar Fecha de Trabajo",
        text: "Debe configurar la fecha de trabajo en el sistema Dianasis para este punto de venta antes de registrar o modificar pedidos.",
        confirmButtonColor: "#ef4444",
        confirmButtonText: "Entendido",
        allowEnterKey: false
      });
      return;
    }

    if (comanderaBloqueada) return;

    if (!cabeceraConfirmada) {
      if (!mesa.trim()) {
        Swal.fire({
          icon: "warning",
          title: "Mesa Requerida",
          text: "Por favor digite el número de mesa antes de agregar productos.",
          confirmButtonColor: "#e31b23"
        });
        return;
      }
      if (!mesero) {
        Swal.fire({
          icon: "warning",
          title: "Mesero Requerido",
          text: "Por favor seleccione el mesero responsable antes de agregar productos.",
          confirmButtonColor: "#e31b23"
        });
        return;
      }
      const ok = await verificarMesa();
      if (!ok) return;
    }

    const rawQty = cantidadesRapidas[p.ProIdInProducto];
    const customQty = (rawQty === "" || rawQty === undefined) ? 1 : Math.max(1, Number(rawQty) || 1);

    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/productos/${p.ProIdInProducto}/adicionales`, {
        method: "GET",
        headers
      });

      if (resp.ok) {
        const resData = await resp.json();
        const sideGroups: SelectionGroup[] = resData.body || [];

        if (sideGroups.length > 0) {
          setSelectedProduct(p);
          setAvailableSides(sideGroups);
          setModalProductQty(customQty);
          
          const initialSelection: Record<number, SelectedSideItem[]> = {};
          sideGroups.forEach(g => {
            initialSelection[g.CprIdInAdicionales] = [];
          });
          setSelectedSides(initialSelection);
          
          setCurrentSideGroupIndex(0);
          setModalSidesOpen(true);
        } else {
          executeAddToCart(p, [], customQty);
        }
      } else {
        executeAddToCart(p, [], customQty);
      }
    } catch (e) {
      console.error("Error al obtener modificadores", e);
      executeAddToCart(p, [], customQty);
    }
  };

  // Manejar la elección de acompañamientos / adicionales
  const toggleSideSelection = (group: SelectionGroup, opt: AccompanimentOption) => {
    const groupId = group.CprIdInAdicionales;
    const currentSelected = selectedSides[groupId] || [];
    const limit = group.CprInCantidad * modalProductQty;

    const existIdx = currentSelected.findIndex(s => s.ApmIdInProducto === opt.ApmIdInProducto);

    if (existIdx !== -1) {
      // Si ya existe, lo removemos de la selección
      const updatedList = currentSelected.filter(s => s.ApmIdInProducto !== opt.ApmIdInProducto);
      setSelectedSides(prev => ({
        ...prev,
        [groupId]: updatedList
      }));
    } else {
      const totalSelectedQty = currentSelected.reduce((sum, s) => sum + s.cantidad, 0);

      if (limit > 0 && totalSelectedQty >= limit) {
        if (limit === 1) {
          setSelectedSides(prev => ({
            ...prev,
            [groupId]: [{
              ApmIdInProducto: opt.ApmIdInProducto,
              ProStDescripcion: opt.ProStDescripcion,
              precioVenta: opt.ApmStIncrementaPrecio === "1" ? opt.ApmInValorFijo : 0,
              cantidad: 1,
              ApmStIncrementaPrecio: opt.ApmStIncrementaPrecio,
              ApmInValorFijo: opt.ApmInValorFijo
            }]
          }));
        } else {
          Swal.fire({
            icon: "warning",
            title: "Límite superado",
            text: `Solo puedes elegir hasta ${limit} opciones en "${group.AprStDescripcion}"`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: "center"
          });
        }
      } else {
        setSelectedSides(prev => ({
          ...prev,
          [groupId]: [...currentSelected, {
            ApmIdInProducto: opt.ApmIdInProducto,
            ProStDescripcion: opt.ProStDescripcion,
            precioVenta: opt.ApmStIncrementaPrecio === "1" ? opt.ApmInValorFijo : 0,
            cantidad: 1,
            ApmStIncrementaPrecio: opt.ApmStIncrementaPrecio,
            ApmInValorFijo: opt.ApmInValorFijo
          }]
        }));
      }
    }
  };

  const adjustSideQty = (groupId: number, sideId: number, delta: number) => {
    const group = availableSides.find(g => g.CprIdInAdicionales === groupId);
    if (!group) return;

    const limit = group.CprInCantidad * modalProductQty;
    const currentSelected = selectedSides[groupId] || [];
    const totalSelectedQty = currentSelected.reduce((sum, s) => sum + s.cantidad, 0);

    const updated = currentSelected.map(s => {
      if (s.ApmIdInProducto === sideId) {
        const nextQty = s.cantidad + delta;
        if (nextQty <= 0) return null;
        if (delta > 0 && limit > 0 && totalSelectedQty >= limit) {
          return s; // No exceder el límite total del grupo
        }
        return { ...s, cantidad: nextQty };
      }
      return s;
    }).filter(Boolean) as SelectedSideItem[];

    setSelectedSides(prev => ({
      ...prev,
      [groupId]: updated
    }));
  };

  const esGrupoObligatorio = (group: SelectionGroup, customQty: number = modalProductQty): boolean => {
    if (group.CprStObligatorio === "0") return false;

    const titulo = (group.AprStDescripcion || "").trim().toUpperCase();
    if (titulo.includes("MODIFICACIO")) return false;

    if (group.acompanantes && group.acompanantes.length > 0) {
      const todasSonSin = group.acompanantes.every(opt => {
        const desc = (opt.ProStDescripcion || "").trim().toUpperCase();
        return desc.startsWith("SIN ") || desc.startsWith("NO ") || desc.startsWith("SIN/NO");
      });
      if (todasSonSin) return false;
    }

    const targetQty = group.CprInCantidad * customQty;
    return group.CprStObligatorio === "1" || targetQty > 0;
  };

  const confirmSides = () => {
    if (!selectedProduct) return;
    const customQty = modalProductQty;

    // Validar grupos obligatorios
    for (let i = 0; i < availableSides.length; i++) {
      const group = availableSides[i];
      const targetQty = group.CprInCantidad * customQty;
      const isObligatorio = esGrupoObligatorio(group, customQty);
      if (isObligatorio) {
        const groupSelected = selectedSides[group.CprIdInAdicionales] || [];
        const totalSelected = groupSelected.reduce((sum, item) => sum + item.cantidad, 0);
        const minRequired = targetQty > 0 ? targetQty : 1;

        if (totalSelected < minRequired) {
          setCurrentSideGroupIndex(i);
          const faltantes = minRequired - totalSelected;
          Swal.fire({
            icon: "warning",
            title: "Selección incompleta",
            text: targetQty > 0
              ? `Debes seleccionar ${minRequired} opciones en "${group.AprStDescripcion}" (${totalSelected}/${minRequired}). Faltan ${faltantes}.`
              : `Debes elegir una opción para "${group.AprStDescripcion}".`,
            confirmButtonText: "Entendido",
            confirmButtonColor: "#ef4444"
          });
          return;
        }
      }
    }

    const sidesList: { ApmIdInProducto: number; ProStDescripcion: string; precioVenta: number; cantidad: number }[] = [];
    
    // Recorrer availableSides en el orden exacto definido en el grupo (Acompañamientos primero, Términos después)
    availableSides.forEach(group => {
      const groupSelected = selectedSides[group.CprIdInAdicionales] || [];
      groupSelected.forEach(item => {
        sidesList.push({
          ApmIdInProducto: item.ApmIdInProducto,
          ProStDescripcion: item.ProStDescripcion,
          precioVenta: item.precioVenta,
          cantidad: item.cantidad
        });
      });
    });

    executeAddToCart(selectedProduct, sidesList, customQty);
    setModalSidesOpen(false);
    setSelectedProduct(null);
  };

  // Realizar la inserción en el carrito
  const executeAddToCart = (p: Product, sides: CartItem["adicionales"], customQty: number) => {
    const sidesKey = (sides || []).map(s => s.ApmIdInProducto).sort().join(",");

    setCarrito(prev => {
      // Buscar si ya existe un ítem NO impreso y NO eliminado idéntico para sumar cantidad
      const existingIdx = prev.findIndex(x => 
        !x.esEliminado && 
        x.MopStImpreso !== '1' && 
        x.ProIdInProducto === p.ProIdInProducto && 
        (x.adicionales || []).map(s => s.ApmIdInProducto).sort().join(",") === sidesKey &&
        !(x.observacion || "").trim()
      );

      if (existingIdx !== -1) {
        const newCart = [...prev];
        newCart[existingIdx] = {
          ...newCart[existingIdx],
          cantidad: newCart[existingIdx].cantidad + customQty
        };
        return newCart;
      }

      const newUnprintedId = `${p.ProIdInProducto}_${sidesKey}_new_${Date.now()}_${Math.random()}`;
      return [
        ...prev,
        {
          idUnicoCart: newUnprintedId,
          ProIdInProducto: p.ProIdInProducto,
          ProStDescripcion: p.ProStDescripcion,
          precioVenta: p.precioVenta,
          cantidad: customQty,
          ProIdInUnidadVenta: p.ProIdInPresentacion || 1,
          ProInCosto: Number(p.ProInCosto) || 0,
          ProInIvaVenta: Number(p.ProInIva) || 0,
          ProInPorcentajeImpoconsumo: Number(p.ProInPorcentajeImpoconsumo) || 0,
          ProStIvaIncluido: p.ProStIvaIncluido !== undefined ? p.ProStIvaIncluido : '1',
          MopStImpreso: '0',
          ImpNombre1: p.ImpNombre1 || "Comanda General",
          adicionales: sides,
          observacion: ""
        }
      ];
    });

    // Restablecer el contador de cantidad rápida y limpiar el buscador
    setCantidadesRapidas(prev => ({ ...prev, [p.ProIdInProducto]: 1 }));
    setBusquedaProducto("");

    Swal.fire({
      icon: "success",
      title: "Agregado",
      text: `${p.ProStDescripcion} (x${customQty}) agregado al pedido`,
      timer: 1000,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });
  };

  const cambiarCantidadRapida = (id: number, val: number | string) => {
    setCantidadesRapidas(prev => ({
      ...prev,
      [id]: val === "" ? "" : Math.max(1, Number(val) || 1)
    }));
  };

  const handleEditObservacion = (idUnicoCart: string) => {
    const item = carrito.find(x => x.idUnicoCart === idUnicoCart);
    if (!item) return;

    if (item.MopStImpreso === '1') {
      Swal.fire({
        icon: 'info',
        title: 'Producto Impreso',
        text: 'No se pueden colocar observaciones a productos que ya fueron enviados a comanda.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      return;
    }

    const obsActual = item.observacion || "";

    const obsBotonesHtml = obsPredefinidas && obsPredefinidas.length > 0
      ? `<div class="d-flex flex-wrap justify-content-center gap-1 my-3">
          ${obsPredefinidas.map((o: any) => 
            `<button type="button" class="btn btn-sm btn-outline-danger btn-obs-rapida mb-1" data-val="${o.descripcion}">${o.descripcion}</button>`
          ).join("")}
         </div>`
      : `<p class="text-muted small">No hay observaciones rápidas cargadas</p>`;

    Swal.fire({
      title: 'Editar Observación',
      html: `
        <div class="text-start mb-2">
          <strong>Producto:</strong> ${item.ProStDescripcion}
        </div>
        <input id="swal-obs-input" class="swal2-input m-0 w-100" placeholder="Escribe una observación..." value="${obsActual}">
        <div class="mt-3">
          <small class="text-muted d-block mb-1 fw-bold">Observaciones Rápidas:</small>
          ${obsBotonesHtml}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Aceptar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33',
      didOpen: () => {
        const input = document.getElementById('swal-obs-input') as HTMLInputElement;
        if (input) {
          input.focus();
          const btns = document.querySelectorAll('.btn-obs-rapida');
          btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
              const val = (e.currentTarget as HTMLElement).getAttribute('data-val');
              if (val) {
                const currentVal = input.value.trim();
                input.value = currentVal ? `${currentVal}, ${val}` : val;
                input.focus();
              }
            });
          });
        }
      },
      preConfirm: () => {
        const input = document.getElementById('swal-obs-input') as HTMLInputElement;
        return input ? input.value : "";
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const nuevaObs = (result.value || "").trim().toUpperCase();
        setCarrito(prev => prev.map(x => {
          if (x.idUnicoCart === idUnicoCart) {
            return { ...x, observacion: nuevaObs };
          }
          return x;
        }));
      }
    });
  };

  const solicitarAutorizacionAdmin = async (): Promise<boolean> => {
    const { value: clave } = await Swal.fire({
      title: 'Autorización Requerida',
      input: 'password',
      inputLabel: 'Ingrese clave de administrador para autorizar la modificación:',
      inputPlaceholder: 'Contraseña del Administrador',
      inputAttributes: {
        autocapitalize: 'off',
        autocorrect: 'off'
      },
      showCancelButton: true,
      confirmButtonText: 'Validar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (!clave) return false;

    Swal.fire({
      title: 'Validando...',
      text: 'Verificando credenciales en la base de datos...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/validar-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'empresa': infoPuntoVenta?.PveIdStEmpresa || '02'
        },
        body: JSON.stringify({ clave })
      });

      Swal.close();

      if (resp.ok) {
        const resData = await resp.json();
        if (resData.body && resData.body.valido === true) {
          return true;
        }
      }

      Swal.fire({
        icon: 'error',
        title: 'Acceso Denegado',
        text: 'La clave ingresada no corresponde a un administrador activo.',
        confirmButtonColor: '#ef4444'
      });
      return false;
    } catch (e) {
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Error de Conexión',
        text: 'Ocurrió un error al contactar al servidor de autorizaciones.',
        confirmButtonColor: '#ef4444'
      });
      return false;
    }
  };

  const handleUpdateQty = async (idUnicoCart: string, delta: number) => {
    const item = carrito.find(x => x.idUnicoCart === idUnicoCart);
    if (!item) return;

    if (item.MopStImpreso === '1') {
      Swal.fire({
        icon: 'info',
        title: 'Producto Impreso',
        text: 'No se puede modificar la cantidad de un producto que ya fue impreso.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      return;
    }

    if (item.esEliminado) {
      if (delta > 0) {
        setCarrito(prev => prev.map(x => x.idUnicoCart === idUnicoCart ? { ...x, esEliminado: false } : x));
      }
      return;
    }

    if (delta < 0) {
      const isEliminating = item.cantidad + delta <= 0;
      const confirmText = isEliminating 
        ? `¿Desea eliminar el producto "${item.ProStDescripcion}" del carrito?`
        : `¿Desea reducir la cantidad de "${item.ProStDescripcion}"?`;

      const confirmResult = await Swal.fire({
        title: 'Confirmación',
        text: confirmText,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'No, cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
      });

      if (!confirmResult.isConfirmed) return;

      if (item.MopStImpreso === '1') {
        const autorizado = await solicitarAutorizacionAdmin();
        if (!autorizado) return;
      }
    }

    if (delta > 0 && item.MopStImpreso === '1') {
      const sidesKey = (item.adicionales || []).map(s => s.ApmIdInProducto).sort().join(",");
      const baseCartId = `${item.ProIdInProducto}_${sidesKey}`;

      setCarrito(prev => {
        const unprintedIdx = prev.findIndex(x => 
          !x.esEliminado && 
          x.MopStImpreso !== '1' && 
          x.ProIdInProducto === item.ProIdInProducto && 
          (x.adicionales || []).map(s => s.ApmIdInProducto).sort().join(",") === sidesKey
        );

        if (unprintedIdx !== -1) {
          const newCart = [...prev];
          newCart[unprintedIdx].cantidad += delta;
          return newCart;
        } else {
          const newUnprintedId = `${baseCartId}_new_${Date.now()}_${Math.random()}`;
          return [
            ...prev,
            {
              idUnicoCart: newUnprintedId,
              ProIdInProducto: item.ProIdInProducto,
              ProStDescripcion: item.ProStDescripcion,
              precioVenta: item.precioVenta,
              cantidad: delta,
              ProIdInUnidadVenta: item.ProIdInUnidadVenta || 1,
              ProInCosto: item.ProInCosto || 0,
              ProInIvaVenta: item.ProInIvaVenta || 0,
              ProInPorcentajeImpoconsumo: item.ProInPorcentajeImpoconsumo || 0,
              ProStIvaIncluido: item.ProStIvaIncluido,
              MopStImpreso: '0',
              ImpNombre1: item.ImpNombre1 || "Comanda General",
              adicionales: item.adicionales || [],
              observacion: item.observacion || ""
            }
          ];
        }
      });
      return;
    }

    // Si el item NO está impreso, tiene acompañamientos y queremos agregar más unidades
    // → abrir el modal de acompañamientos para que el usuario elija los del nuevo ítem
    if (delta > 0 && item.MopStImpreso !== '1' && item.adicionales && item.adicionales.length > 0) {
      // Reconstruir el objeto Product a partir del CartItem
      const productoParaModal: Product = {
        ProIdInProducto: item.ProIdInProducto,
        ProStDescripcion: item.ProStDescripcion,
        precioVenta: item.precioVenta,
        ProInPrecio: item.precioVenta,
        ProIdInPresentacion: 0,
        ProIdInUnidadVenta: item.ProIdInUnidadVenta || 1,
        ProInCosto: item.ProInCosto || 0,
        ProInIvaVenta: item.ProInIvaVenta || 0,
        ProInPorcentajeImpoconsumo: item.ProInPorcentajeImpoconsumo || 0,
        ProStIvaIncluido: item.ProStIvaIncluido,
        ExiInCantidadFinalBodega: 999,
        PreStAbreviatura: "",
        ImpNombre1: item.ImpNombre1 || "Comanda General"
      };
      // Forzar cantidad 1 para el nuevo ítem
      setCantidadesRapidas(prev => ({ ...prev, [item.ProIdInProducto]: 1 }));
      await addProductToCart(productoParaModal);
      return;
    }

    setCarrito(prev => {
      const idx = prev.findIndex(x => x.idUnicoCart === idUnicoCart);
      if (idx === -1) return prev;

      const newCart = [...prev];
      const newQty = newCart[idx].cantidad + delta;
      
      if (newQty <= 0) {
        if (newCart[idx].MopStImpreso === '1') {
          newCart[idx].esEliminado = true;
          return newCart;
        } else {
          return newCart.filter(x => x.idUnicoCart !== idUnicoCart);
        }
      } else {
        newCart[idx].cantidad = newQty;
        return newCart;
      }
    });
  };

  const handleRemoveItem = async (idUnicoCart: string) => {
    const item = carrito.find(x => x.idUnicoCart === idUnicoCart);
    if (!item) return;

    if (item.MopStImpreso === '1') {
      Swal.fire({
        icon: 'info',
        title: 'Producto Impreso',
        text: 'Los productos ya impresos no se pueden eliminar.',
        timer: 2000,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      return;
    }

    if (item.esEliminado) {
      setCarrito(prev => prev.map(x => x.idUnicoCart === idUnicoCart ? { ...x, esEliminado: false } : x));
      return;
    }

    const confirmResult = await Swal.fire({
      title: 'Confirmación',
      text: `¿Desea eliminar el producto "${item.ProStDescripcion}" del carrito?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'No, cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (!confirmResult.isConfirmed) return;

    if (item.MopStImpreso === '1') {
      const autorizado = await solicitarAutorizacionAdmin();
      if (!autorizado) return;

      setCarrito(prev => prev.map(x => x.idUnicoCart === idUnicoCart ? { ...x, esEliminado: true } : x));
    } else {
      setCarrito(prev => prev.filter(x => x.idUnicoCart !== idUnicoCart));
    }
  };

  const clearForm = (force = false) => {
    if (ordenId && !force) {
      Swal.fire({
        icon: "warning",
        title: "Acción no permitida",
        text: "No se puede vaciar el carrito de una orden que ya está abierta en mesa.",
        confirmButtonColor: "#ef4444"
      });
      return;
    }
    if (mesa) liberarMesaActual(mesa);
    localStorage.removeItem("comanda_draft_cart");
    setMesa("");
    setOrdenId(null);
    setCarrito([]);
    setNumPersonas(1);
    setBusquedaProducto("");
    setVistaMovil("productos");
    setCabeceraConfirmada(false);
    
    if (loggedVendedor) {
      setMesero({
        id: loggedVendedor.CliNit,
        nombre: loggedVendedor.CliStNombreCliente,
        codigo: loggedVendedor.CliStCodigoBanco
      });
      setMeseroBusqueda(loggedVendedor.CliStNombreCliente);
    } else {
      setMesero(null);
      setMeseroBusqueda("");
    }
  };

  // Calcular totales
  // Calcular totales y deducir impuestos informativos (IVA e INC) a partir del precio original
  const resumenTotales = useMemo(() => {
    let totalAcumulado = 0;
    let ivaAcumulado = 0;
    let incAcumulado = 0;

    carrito.filter(item => !item.esEliminado).forEach(item => {
      const parentPrice = item.precioVenta;
      const sidesPrice = item.adicionales.reduce((sum, ad) => sum + ad.precioVenta, 0);
      const precioItemTotal = parentPrice + sidesPrice;
      const cant = item.cantidad;

      const pIva = Number(item.ProInIvaVenta) || 0;
      const pInc = Number(item.ProInPorcentajeImpoconsumo) || 0;
      const esIvaIncluido = Number(item.ProStIvaIncluido) === 1;

      if (esIvaIncluido) {
        const totalBruto = precioItemTotal * cant;
        const factorImpuestos = (pIva + pInc) / 100;
        const baseIva = totalBruto / (1 + factorImpuestos);
        const valorIva = (baseIva * pIva) / 100;
        const valorImpoconsumo = (baseIva * pInc) / 100;

        totalAcumulado += totalBruto;
        ivaAcumulado += valorIva;
        incAcumulado += valorImpoconsumo;
      } else {
        const subtotal = precioItemTotal * cant;
        const valorIva = (subtotal * pIva) / 100;
        const valorImpoconsumo = (subtotal * pInc) / 100;
        const totalBruto = subtotal + valorIva + valorImpoconsumo;

        totalAcumulado += totalBruto;
        ivaAcumulado += valorIva;
        incAcumulado += valorImpoconsumo;
      }
    });

    return {
      iva: Math.round(ivaAcumulado),
      impoconsumo: Math.round(incAcumulado),
      total: Math.round(totalAcumulado)
    };
  }, [carrito]);

  const subtotal = resumenTotales.total - resumenTotales.iva - resumenTotales.impoconsumo;
  const total = resumenTotales.total;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
  };





  const reintentarImpresionManual = async (nroOrden: string | number) => {
    Swal.fire({
      title: "Enviando a impresora...",
      text: "Por favor espere un momento...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const resp = await apiFetch(`${API_BASE_URL}/ordenes/${nroOrden}/imprimir`, {
        method: "POST",
        headers,
        body: JSON.stringify({ esReimpresion: false })
      });

      const resData = await resp.json();
      Swal.close();

      if (resp.ok && resData.body?.success !== false) {
        setErrorImpresora(null);
        Swal.fire({
          icon: "success",
          title: "Impresión exitosa",
          text: `Comanda #${nroOrden} enviada correctamente.`,
          timer: 1500,
          showConfirmButton: false
        });
        clearForm(true);
        if (onClearInitial) onClearInitial();
      } else {
        const errorText = resData.mensaje || resData.body?.error || resData.error || "La impresora no respondió. Revisa la conexión.";
        setErrorImpresora(errorText);

        Swal.fire({
          icon: "warning",
          title: "No se pudo imprimir",
          text: errorText,
          showCancelButton: true,
          confirmButtonText: "🔄 Reintentar",
          cancelButtonText: "Cerrar",
          confirmButtonColor: "#eab308",
          cancelButtonColor: "#64748b"
        }).then((r) => {
          if (r.isConfirmed) {
            reintentarImpresionManual(nroOrden);
          }
        });
      }
    } catch (e) {
      Swal.close();
      const errText = "No se pudo comunicar con el servicio de impresión.";
      setErrorImpresora(errText);
      Swal.fire({
        icon: "error",
        title: "Error de Conexión",
        text: errText,
        showCancelButton: true,
        confirmButtonText: "🔄 Reintentar",
        cancelButtonText: "Cerrar",
        confirmButtonColor: "#eab308",
        cancelButtonColor: "#64748b"
      }).then((r) => {
        if (r.isConfirmed) {
          reintentarImpresionManual(nroOrden);
        }
      });
    }
  };

  // Guardar/Actualizar la orden en la base de datos
  const guardarComanda = async () => {
    const sinFecha = storage.getItem("sinFechaTrabajo") === "true";
    if (sinFecha) {
      Swal.fire({
        icon: "error",
        title: "⚠️ Configurar Fecha de Trabajo",
        text: "Debe configurar la fecha de trabajo en el sistema Dianasis para este punto de venta antes de registrar o modificar pedidos.",
        confirmButtonColor: "#ef4444",
        confirmButtonText: "Entendido",
        allowEnterKey: false
      });
      return;
    }

    if (comanderaBloqueada) {
      Swal.fire({
        icon: "error",
        title: "Comandera Bloqueada",
        text: "La comandera se encuentra bloqueada por el sistema. No se pueden registrar o modificar pedidos."
      });
      return;
    }
    if (!mesa.trim()) {
      Swal.fire({ icon: "error", title: "Datos incompletos", text: "Por favor digite el número de mesa" });
      return;
    }
    if (!mesero) {
      Swal.fire({ icon: "error", title: "Datos incompletos", text: "Por favor seleccione el mesero" });
      return;
    }
    if (carrito.length === 0) {
      Swal.fire({ icon: "error", title: "Pedido vacío", text: "Por favor agregue productos al pedido" });
      return;
    }

    const productosActivos = carrito.filter(item => !item.esEliminado);
    if (!ordenId && productosActivos.length === 0) {
      Swal.fire({ icon: "error", title: "Pedido vacío", text: "Por favor agregue productos activos al pedido" });
      return;
    }

    Swal.fire({
      title: ordenId ? "Actualizando Pedido" : "Guardando Pedido",
      text: "Por favor espera un momento...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    setGuardando(true);

    try {
      const payload = {
        OpeStMesa: mesa.trim(),
        OpeIdStVendedor: mesero.id,
        OpeInNumPersonas: Number(numPersonas) || 1,
        OpeIdStComprobante: infoPuntoVenta?.ComprobanteComanda || undefined,
        nombre_terminal: terminalName,
        productos: carrito.filter(item => !item.esEliminado).map(item => ({
          ProIdInProducto: item.ProIdInProducto,
          precioVenta: item.precioVenta,
          cantidad: item.cantidad,
          ProIdInUnidadVenta: item.ProIdInUnidadVenta,
          MopStImpreso: item.MopStImpreso || '0',
          observacion: item.observacion || "",
          adicionales: item.adicionales.map(ad => ({
            ApmIdInProducto: ad.ApmIdInProducto,
            precioVenta: ad.precioVenta,
            cantidad: ad.cantidad || 1
          }))
        }))
      };

      const url = ordenId 
        ? `${API_BASE_URL}/ordenes/${ordenId}`
        : `${API_BASE_URL}/ordenes`;

      const method = ordenId ? "PUT" : "POST";

      const resp = await apiFetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const text = await resp.text();
      let resData;
      try {
        resData = JSON.parse(text);
      } catch {
        resData = null;
      }

      if (!resp.ok || resData?.error) {
        const errorMsg = resData?.mensaje 
          || resData?.body?.message 
          || (typeof resData?.body === 'string' ? resData.body : null)
          || resData?.message 
          || `Error del servidor (${resp.status})`;
        throw new Error(errorMsg);
      }

      setErrorImpresora(null);
      Swal.close();

      const nroGuardado = resData?.body?.nro_orden || ordenId;
      const obligatorioImprimir = isMandatoryPrintEnabled();

      if (obligatorioImprimir && nroGuardado) {
        reintentarImpresionManual(nroGuardado);
      } else {
        Swal.fire({
          icon: "success",
          title: "Pedido guardado",
          text: `Mesa: ${mesa} - Orden: #${nroGuardado || ''}`,
          timer: 1500,
          showConfirmButton: false
        });

        clearForm(true);
        liberarMesaActual(mesa);
        localStorage.removeItem("comanda_draft_cart");
        if (onClearInitial) onClearInitial();
      }

    } catch (err) {
      Swal.close();
      const msg = err instanceof Error ? err.message : "Error al guardar";
      const sanitized = sanitizarError(msg);
      setErrorImpresora(sanitized);
      Swal.fire({
        icon: "error",
        title: "Error al guardar",
        text: sanitized
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className={`crear-ordenes-page px-1 px-md-3 pt-0 ${searchFocused ? "search-active" : ""}`} aria-label="Crear Órdenes">
      {cargandoComanda && (
        <div 
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(255, 255, 255, 0.8)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(3px)"
          }}
        >
          <div className="spinner-border text-danger mb-3" role="status" style={{ width: "3.5rem", height: "3.5rem" }}>
            <span className="visually-hidden">Cargando...</span>
          </div>
          <h4 className="fw-bold text-dark mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Cargando comanda...</h4>
          <p className="text-muted small m-0">Recuperando datos del pedido abierto en la mesa</p>
        </div>
      )}
      <div className="container-fluid pt-2 px-1 px-md-2">
        {comanderaBloqueada && (
          <div 
            className="alert alert-danger d-flex align-items-center gap-2 mb-3 rounded-4 border-0 shadow-sm" 
            style={{ background: "#fee2e2", color: "#991b1b", fontFamily: "'Outfit', sans-serif" }}
          >
            <span style={{ fontSize: "1.25rem" }}>⚠️</span>
            <div className="fw-bold">La comandera se encuentra bloqueada por el sistema. No se pueden registrar ni modificar pedidos.</div>
          </div>
        )}
        {/* Header Strip y Secciones Unificadas en un Solo Card Blanco */}
        <div className="co-unified-main-card">
          <header className="co-header d-flex flex-column gap-1">
          <div className="d-flex align-items-center justify-content-between flex-nowrap w-100 gap-2">
            <div className="d-flex align-items-center gap-2 min-w-0">
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "#e31b23",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 1px 4px rgba(227, 27, 35, 0.2)"
                }}
              >
                <FiPlus size={14} />
              </div>
              <h1 className="co-header-title text-nowrap m-0" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                {ordenId ? `ORDEN #${ordenId}` : "NUEVO PEDIDO"}
              </h1>

              {errorImpresora && (
                <button
                  type="button"
                  className="btn btn-sm d-flex align-items-center gap-1 p-1 px-2 border-0 shadow-sm"
                  style={{
                    background: "#fee2e2",
                    border: "1.5px solid #ef4444",
                    color: "#b91c1c",
                    borderRadius: "8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    animation: "pulse 1.5s infinite",
                    flexShrink: 0,
                    lineHeight: 1
                  }}
                  title={errorImpresora}
                  onClick={() => {
                    Swal.fire({
                      icon: "error",
                      title: "Problema con la Impresora",
                      text: errorImpresora,
                      confirmButtonColor: "#e31b23",
                      confirmButtonText: "Entendido"
                    });
                  }}
                >
                  <img src="/impresora_rota.png" alt="Fallo Impresora" style={{ width: "20px", height: "20px", objectFit: "contain", flexShrink: 0 }} onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }} />
                  <span className="d-none d-sm-inline" style={{ fontSize: "0.72rem" }}>Fallo Impresora</span>
                </button>
              )}
            </div>

            <div className="d-flex align-items-center gap-2 flex-nowrap ms-auto">
              <div className="co-total-desktop">
                <span>Total</span>
                <strong>{formatMoneda(total)}</strong>
              </div>

              {onClearInitial && (
                <button
                  type="button"
                  title="Volver a órdenes abiertas"
                  onClick={() => {
                    if (sinImprimirCount > 0) {
                      const text = `Tiene ${sinImprimirCount} ${sinImprimirCount === 1 ? 'producto sin imprimir' : 'productos sin imprimir'}. ¿Desea salir?`;
                      Swal.fire({
                        icon: "warning",
                        title: "Productos sin imprimir",
                        text,
                        showCancelButton: true,
                        confirmButtonColor: "#e31b23",
                        cancelButtonColor: "#64748b",
                        confirmButtonText: "Sí, salir",
                        cancelButtonText: "Cancelar"
                      }).then((result) => {
                        if (result.isConfirmed) {
                          if (mesa) liberarMesaActual(mesa);
                          localStorage.removeItem("comanda_draft_cart");
                          onClearInitial();
                        }
                      });
                    } else {
                      if (mesa) liberarMesaActual(mesa);
                      localStorage.removeItem("comanda_draft_cart");
                      onClearInitial();
                    }
                  }}
                  className="btn btn-sm d-flex align-items-center gap-1 fw-bold"
                  style={{
                    border: "1.5px solid #cbd5e1",
                    borderRadius: "6px",
                    background: "#ffffff",
                    color: "#334155",
                    padding: "3px 8px",
                    height: "28px",
                    cursor: "pointer",
                    flexShrink: 0,
                    fontSize: "0.75rem",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#e31b23"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#e31b23"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#ffffff"; (e.currentTarget as HTMLButtonElement).style.color = "#334155"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1"; }}
                >
                  <FiArrowLeft size={14} />
                  <span>Volver</span>
                </button>
              )}
            </div>
          </div>

          {/* Fila Inferior Integrada en la misma Card: Mesa, Pers, Mesero */}
          {cabeceraConfirmada && (
            <div 
              className="d-flex align-items-center flex-nowrap gap-2 pt-2 pb-1 mt-2 border-top w-100 overflow-hidden"
              style={{ 
                borderColor: "#f1f5f9", 
                fontFamily: "'Outfit', sans-serif",
                fontSize: "0.74rem",
                color: "#0f172a"
              }}
            >
              <span className="text-nowrap fw-bold" style={{ color: "#0f172a" }}>
                Mesa: {mesa}
              </span>
              <span style={{ color: "#cbd5e1" }}>|</span>
              <span className="text-nowrap fw-bold" style={{ color: "#0f172a" }}>
                Pers: {numPersonas}
              </span>
              <span style={{ color: "#cbd5e1" }}>|</span>
              <span className="text-truncate text-uppercase fw-bold" style={{ color: "#0f172a" }}>
                MESERO: {mesero?.nombre || "VENDEDOR"}
              </span>
            </div>
          )}
        </header>

        {/* Strip de Selección (Solo cuando no está confirmada la cabecera) */}
        {!cabeceraConfirmada && (
          <div className="co-filters-strip">
            <div className="row g-2 g-md-3 align-items-end">
              {/* Renglón 1 Móvil: Table / Mesa (col-7) */}
              <div className="col-7 col-md-3">
                <label className="co-form-label">Digite Mesa</label>
                <div className="co-input-box" style={{ opacity: cabeceraConfirmada ? 0.75 : 1 }}>
                  <FiGrid size={16} />
                  <input
                    type="text"
                    value={mesa}
                    onChange={(e) => setMesa(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!mesa.trim()) {
                          Swal.fire({
                            icon: "error",
                            title: "Mesa Requerida",
                            text: "Falta ingresar la mesa.",
                            confirmButtonColor: "#e31b23",
                            allowEnterKey: false
                          });
                          return;
                        }
                        if (!mesero) {
                          Swal.fire({
                            icon: "error",
                            title: "Mesero Requerido",
                            text: "Falta seleccionar el mesero responsable.",
                            confirmButtonColor: "#e31b23",
                            allowEnterKey: false
                          });
                          return;
                        }
                        verificarMesa();
                      }
                    }}
                    placeholder="Mesa..."
                    disabled={cabeceraConfirmada}
                  />
                </div>
              </div>

              {/* Renglón 1 Móvil: Guest Counter (col-5) */}
              <div className="col-5 col-md-2">
                <label className="co-form-label">Nro. Personas</label>
                <div className="co-people-counter-box" style={{ opacity: cabeceraConfirmada ? 0.75 : 1 }}>
                  <button
                    type="button"
                    className="co-btn-counter-inc"
                    onClick={() => setNumPersonas(prev => Math.max(1, Number(prev) - 1))}
                    disabled={Number(numPersonas) <= 1 || cabeceraConfirmada}
                  >
                    <FiMinus size={12} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={numPersonas}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === "") {
                        setNumPersonas("");
                      } else {
                        const val = Number(valStr);
                        setNumPersonas(val >= 0 ? val : 1);
                      }
                    }}
                    onBlur={() => {
                      if (numPersonas === "" || Number(numPersonas) === 0) {
                        setNumPersonas(1);
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="co-counter-val border-0 p-0"
                    style={{ outline: "none", background: "transparent" }}
                    disabled={cabeceraConfirmada}
                  />
                  <button
                    type="button"
                    className="co-btn-counter-inc"
                    onClick={() => setNumPersonas(prev => Number(prev) + 1)}
                    disabled={cabeceraConfirmada}
                  >
                    <FiPlus size={12} />
                  </button>
                </div>
              </div>

              {/* Renglón 2 Móvil: Waiter / Mesero Autocomplete (col-7) */}
              <div className="col-7 col-md-4">
                <label className="co-form-label">Mesero Responsable</label>
                <div className="co-input-box" style={{ opacity: (cabeceraConfirmada || !esAdministrador) ? 0.75 : 1 }}>
                  <FiUser size={16} />
                  <input
                    type="text"
                    value={meseroBusqueda}
                    onChange={(e) => handleMeseroChange(e.target.value)}
                    onFocus={() => { if (!cabeceraConfirmada && esAdministrador) setShowWaitersList(true); }}
                    placeholder="Escriba mesero..."
                    disabled={cabeceraConfirmada || !esAdministrador}
                  />
                  {!cabeceraConfirmada && esAdministrador && (
                    <>
                      {mesero ? (
                        <button className="co-btn-clear" onClick={limpiarMesero} title="Cambiar mesero">
                          <FiX size={14} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setShowWaitersList(v => !v); if (!showWaitersList) fetchWaiters(""); }}
                          style={{ border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                        >
                          <FiList size={14} />
                        </button>
                      )}
                    </>
                  )}

                  {/* Suggestions Flotante */}
                  {showWaitersList && waitersSuggestions.length > 0 && !cabeceraConfirmada && (
                    <div className="co-waiters-dropdown shadow">
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: "700", color: "#64748b" }}>Coincidencias</span>
                        <button
                          type="button"
                          onClick={() => setShowWaitersList(false)}
                          style={{ border: 0, background: "transparent", color: "#e31b23", fontSize: "0.7rem", fontWeight: "bold" }}
                        >
                          Cerrar
                        </button>
                      </div>
                      {waitersSuggestions.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          className="co-waiter-option-btn"
                          onClick={() => selectMesero(w)}
                        >
                          <strong>{w.nombre}</strong>
                          <span>{w.codigo ? `Código: ${w.codigo} | ` : ""}Cédula: {w.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Renglón 2 Móvil: Botón Aceptar (col-5) */}
              <div className="col-5 col-md-3">
                <button
                  type="button"
                  className="btn btn-danger w-100 fw-bold d-flex align-items-center justify-content-center gap-1"
                  style={{
                    borderRadius: "8px",
                    fontFamily: "'Outfit', sans-serif",
                    height: "38px",
                    background: "#e31b23",
                    boxShadow: "0 2px 6px rgba(227, 27, 35, 0.2)",
                    border: "none",
                    color: "#fff",
                    opacity: cabeceraConfirmada ? 0.6 : 1,
                    cursor: cabeceraConfirmada ? "not-allowed" : "pointer",
                    fontSize: "0.78rem"
                  }}
                  disabled={cabeceraConfirmada}
                  onClick={async () => {
                    if (!mesa.trim()) {
                      Swal.fire({
                        icon: "error",
                        title: "Mesa Requerida",
                        text: "Falta ingresar la mesa.",
                        confirmButtonColor: "#e31b23"
                      });
                      return;
                    }
                    if (!mesero) {
                      Swal.fire({
                        icon: "error",
                        title: "Mesero Requerido",
                        text: "Falta seleccionar el mesero responsable.",
                        confirmButtonColor: "#e31b23"
                      });
                      return;
                    }
                    await verificarMesa();
                  }}
                >
                  <FiCheck size={16} />
                  {cabeceraConfirmada ? "ACEPTADO" : "ACEPTAR"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pestañas y Catálogo de Productos (Solo visibles tras confirmar Mesa y Mesero) */}
        {cabeceraConfirmada && (
          <>
            {/* Tab Navbar Switcher */}
            <nav ref={tabsNavbarRef} className="co-tabs-navbar" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <button
            type="button"
            className={`co-tab-item-btn ${vistaMovil === "productos" ? "active" : ""}`}
            onClick={() => setVistaMovil("productos")}
          >
            PRODUCTOS
          </button>
          <button
            type="button"
            className={`co-tab-item-btn ${vistaMovil === "carrito" ? "active" : ""}`}
            onClick={() => setVistaMovil("carrito")}
          >
            CARRITO ({carrito.length})
          </button>
          <button
            type="button"
            className={`co-tab-item-btn ${vistaMovil === "factura" ? "active" : ""}`}
            onClick={() => setVistaMovil("factura")}
          >
            PEDIDO {formatMoneda(total)}
          </button>
        </nav>

        {/* Panels con soporte de gestos táctiles al instante (Swipe izquierda/derecha) */}
        <div 
          onTouchStart={handleTouchStart} 
          onTouchMove={handleTouchMove} 
          onTouchEnd={handleTouchEnd}
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "calc(100vh - 180px)", touchAction: "pan-y" }}
        >

        {/* Panels */}
        
        {/* Panel 1: Productos */}
        <section className={`co-panel ${vistaMovil === "productos" ? "active" : ""}`}>
          
          <div className="d-flex gap-2 mb-2 mt-3 justify-content-start" style={{ margin: '0 12px' }}>
            <button
              type="button"
              className={`btn d-flex align-items-center justify-content-center gap-1 py-1 px-3 fw-bold ${subTabProductos === "productos" ? "btn-dark text-white" : "bg-white text-muted"}`}
              style={{ borderRadius: '6px', fontSize: '0.72rem', minHeight: '30px', border: subTabProductos === "productos" ? "none" : "1px solid #e2e8f0", backgroundColor: subTabProductos === "productos" ? "#1e293b" : "#ffffff" }}
              onClick={() => {
                setSubTabProductos("productos");
                setLineaSeleccionada(null);
              }}
            >
              <FiGrid size={13} /> PRODUCTOS
            </button>
            <button
              type="button"
              className={`btn d-flex align-items-center justify-content-center gap-1 py-1 px-3 fw-bold ${subTabProductos === "categorias" ? "btn-dark text-white" : "bg-white text-muted"}`}
              style={{ borderRadius: '6px', fontSize: '0.72rem', minHeight: '30px', border: subTabProductos === "categorias" ? "none" : "1px solid #e2e8f0", backgroundColor: subTabProductos === "categorias" ? "#1e293b" : "#ffffff" }}
              onClick={() => {
                setSubTabProductos("categorias");
                setLineaSeleccionada(null);
              }}
            >
              <FiLayers size={13} /> CATEGORÍAS
            </button>
          </div>

          {subTabProductos === "categorias" && lineaSeleccionada === null ? (
            <div 
              className="co-categories-grid mb-3" 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', 
                gap: '6px', 
                maxHeight: 'calc(100vh - 280px)', 
                overflowY: 'auto', 
                padding: '0 4px',
                margin: '0 4px',
                width: 'calc(100% - 8px)',
                boxSizing: 'border-box'
              }}
            >
              <button
                type="button"
                className={`co-category-btn px-2 text-center text-white ${lineaSeleccionada === null ? 'active' : ''}`}
                style={{
                  background: lineaSeleccionada === null ? '#ef4444' : '#1e293b'
                }}
                onClick={() => {
                  setLineaSeleccionada(null);
                  setSubTabProductos("productos");
                }}
              >
                TODOS LOS PRODUCTOS
              </button>
              {lineas.map((linea) => {
                const estaSeleccionada = lineaSeleccionada === linea.id;
                return (
                  <button
                    key={linea.id}
                    type="button"
                    className={`co-category-btn px-2 text-center text-white ${estaSeleccionada ? 'active' : ''}`}
                    style={{
                      background: estaSeleccionada ? '#ef4444' : '#1e293b'
                    }}
                    onClick={() => {
                      setLineaSeleccionada(linea.id);
                    }}
                  >
                    {(linea.descripcion || "").toUpperCase()}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="co-search-bar mb-2">
                <FiSearch size={18} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  onFocus={() => {
                    setSearchFocused(true);
                    setTimeout(() => {
                      tabsNavbarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 80);
                  }}
                  onBlur={() => {
                    setTimeout(() => setSearchFocused(false), 250);
                  }}
                  placeholder="BUSCAR PRODUCTO O CODIGO"
                />
              </div>

              {lineaSeleccionada !== null && (
                <div 
                  className="alert alert-info py-2 px-3 mb-2 d-flex align-items-center justify-content-between" 
                  style={{ 
                    borderRadius: '8px', 
                    background: '#eff6ff', 
                    border: '1px solid #dbeafe', 
                    color: '#1e40af', 
                    fontSize: '0.8rem', 
                    fontWeight: 'bold',
                    margin: '0 12px 10px'
                  }}
                >
                  <span>CATEGORÍA ACTIVA: {(lineas.find(l => l.id === lineaSeleccionada)?.descripcion || "").toUpperCase()}</span>
                  <button 
                    type="button" 
                    style={{
                      border: 'none',
                      background: '#ef4444',
                      color: '#ffffff',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: '900',
                      cursor: 'pointer',
                      boxShadow: '0 2px 5px rgba(239, 68, 68, 0.25)',
                      transition: 'all 0.15s ease',
                      padding: 0,
                      lineHeight: '1'
                    }}
                    onClick={() => setLineaSeleccionada(null)}
                    aria-label="Limpiar filtro de categoría"
                  >
                    ✕
                  </button>
                </div>
              )}
            </>
          )}

          <div className="co-products-scroll" style={{ display: (subTabProductos === "categorias" && lineaSeleccionada === null) ? "none" : "block" }}>
            {cargandoProductos && productos.length === 0 ? (
              <div className="text-center py-5 text-muted">Buscando productos...</div>
            ) : productos.length === 0 ? (
              <div className="text-center py-5 text-muted">No hay productos para mostrar</div>
            ) : (
              productos.map((p) => {
                const qtyVal = cantidadesRapidas[p.ProIdInProducto] as string | number | undefined;
                const qty = qtyVal !== undefined ? qtyVal : 1;
                return (
                  <article 
                    key={p.ProIdInProducto} 
                    className="co-product-row"
                    onClick={() => addProductToCart(p)}
                  >
                    <div className="co-product-info">
                      <strong className="co-product-name">{p.ProStDescripcion}</strong>
                      <div className="co-product-meta">
                        <span className="co-meta-code">COD. {p.ProIdInProducto}</span>
                      </div>
                    </div>
                    
                    <div className="d-flex align-items-center gap-2 gap-sm-3" onClick={(e) => e.stopPropagation()}>
                      <span className="co-price">{formatMoneda(p.precioVenta)}</span>
                      
                      <div className="co-qty-compact">
                        <button
                          type="button"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            const currentQty = (qtyVal === "" || qtyVal === undefined) ? 1 : Number(qtyVal);
                            cambiarCantidadRapida(p.ProIdInProducto, currentQty - 1); 
                          }}
                          aria-label="Disminuir"
                        >
                          <FiMinus size={14} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={qty}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || /^[0-9]+$/.test(val)) {
                              cambiarCantidadRapida(p.ProIdInProducto, val);
                            }
                          }}
                          onBlur={() => {
                            if (qty === "" || Number(qty) === 0) {
                              cambiarCantidadRapida(p.ProIdInProducto, 1);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.currentTarget.select();
                          }}
                          onFocus={(e) => {
                            const target = e.currentTarget;
                            setTimeout(() => {
                              try {
                                target.select();
                              } catch (err) {}
                            }, 50);
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            const currentQty = (qtyVal === "" || qtyVal === undefined) ? 1 : Number(qtyVal);
                            cambiarCantidadRapida(p.ProIdInProducto, currentQty + 1); 
                          }}
                          aria-label="Aumentar"
                        >
                          <FiPlus size={14} />
                        </button>
                      </div>

                      <button
                        type="button"
                        className="co-btn-add"
                        onClick={(e) => { e.stopPropagation(); addProductToCart(p); }}
                        aria-label={`Añadir ${p.ProStDescripcion}`}
                      >
                        <FiPlus size={18} />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Panel 2: Carrito */}
        <section className={`co-panel ${vistaMovil === "carrito" ? "active" : ""}`}>
          <div className="co-panel-header d-flex align-items-center justify-content-between flex-wrap gap-2">
            <h2 className="m-0">CARRITO DE PRODUCTOS</h2>
            {sinImprimirCount > 0 && (
              <span className="badge bg-warning text-dark fw-bold px-2.5 py-1.5 shadow-sm" style={{ fontSize: "0.75rem", borderRadius: "6px" }}>
                ⚠️ {sinImprimirCount} {sinImprimirCount === 1 ? "sin imprimir" : "sin imprimir"}
              </span>
            )}
          </div>
          
          <div className="co-cart-scroll">
            {carrito.length === 0 ? (
              <div className="text-center py-5 px-3">
                <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🛒</div>
                <p className="fw-bold mb-1" style={{ color: "#334155", fontSize: "0.95rem" }}>El carrito está vacío</p>
                <p className="text-muted mb-4" style={{ fontSize: "0.8rem" }}>Agrega productos desde la pestaña <strong>PRODUCTOS</strong> o crea una nueva orden.</p>
                <div className="d-flex flex-column gap-2 align-items-center">
                  <button
                    type="button"
                    className="btn btn-danger fw-bold px-4"
                    style={{ borderRadius: "8px", fontSize: "0.8rem" }}
                    onClick={() => setVistaMovil("productos")}
                  >
                    ＋ Agregar Productos
                  </button>
                  {onClearInitial && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary fw-bold px-4"
                      style={{ borderRadius: "8px", fontSize: "0.8rem" }}
                      onClick={() => {
                        clearForm();
                        onClearInitial();
                      }}
                    >
                      ← Volver a Órdenes
                    </button>
                  )}
                </div>
              </div>
            ) : (
              carritoOrdenado.map((item) => {
                const sidesPrice = item.adicionales.reduce((sum, ad) => sum + ad.precioVenta, 0);
                const itemTotal = (item.precioVenta + sidesPrice) * item.cantidad;
                const estaEliminado = Boolean(item.esEliminado);

                // Si está impreso y no está eliminado, renderizar en 1 sola fila súper compacta
                if (item.MopStImpreso === '1' && !estaEliminado) {
                  return (
                    <article
                      key={item.idUnicoCart}
                      className="co-cart-item py-1 px-2 mb-1"
                      style={{ opacity: 0.82, background: "#f8fafc", borderColor: "#e2e8f0" }}
                    >
                      <div className="d-flex align-items-center justify-content-between gap-2" style={{ minHeight: "24px" }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: "0.75rem", color: "#334155", textTransform: "uppercase", whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.2" }}>
                          {item.ProStDescripcion}
                        </span>
                        <span className="text-nowrap text-end ms-auto" style={{ fontSize: "0.75rem", fontWeight: "700", color: "#1e293b", minWidth: "75px" }}>
                          {formatMoneda(itemTotal)}
                        </span>
                        <div className="d-flex align-items-center flex-shrink-0" style={{ gap: "6px" }}>
                          <span 
                            className="badge bg-secondary text-white fw-bold py-1 px-1.5" 
                            style={{ fontSize: "0.6rem", borderRadius: "4px" }}
                          >
                            ✓ IMPRESO
                          </span>
                          <span className="badge bg-white text-secondary border py-1 px-1.5" style={{ fontSize: "0.65rem", fontWeight: "600", borderRadius: "4px" }}>
                            Cant: {item.cantidad}
                          </span>
                        </div>
                      </div>
                      {item.observacion && (
                        <div style={{ fontSize: "0.65rem", color: "#64748b", fontStyle: "italic", marginTop: "1px" }}>
                          📝 {item.observacion}
                        </div>
                      )}
                    </article>
                  );
                }

                return (
                  <article 
                    key={item.idUnicoCart} 
                    className="co-cart-item py-1 px-2 mb-1"
                    style={
                      estaEliminado 
                        ? { background: "#fef2f2", border: "1px dashed #ef4444", opacity: 0.9 } 
                        : {}
                    }
                  >
                    <div className="d-flex align-items-center justify-content-between gap-2" style={{ minHeight: "26px" }}>
                      {/* Lado Izquierdo: Nombre del producto (limpio, sin saturación) */}
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 500,
                          color: estaEliminado ? "#dc2626" : "#334155",
                          fontSize: "0.82rem",
                          textTransform: "uppercase",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          lineHeight: "1.25",
                          textDecoration: estaEliminado ? "line-through" : "none"
                        }}
                      >
                        {item.ProStDescripcion}
                      </span>

                      {/* Columna de Precio limpia */}
                      <span 
                        className="text-nowrap text-end ms-auto"
                        style={{ 
                          color: estaEliminado ? '#94a3b8' : '#1e293b', 
                          fontSize: '0.84rem', 
                          fontWeight: '600', 
                          minWidth: "75px",
                          textDecoration: estaEliminado ? 'line-through' : 'none' 
                        }}
                      >
                        {estaEliminado ? "$0" : formatMoneda(itemTotal)}
                      </span>

                      {estaEliminado && (
                        <Badge bg="danger" style={{ fontSize: "0.6rem", padding: "2px 4px" }}>
                          ELIMINADO
                        </Badge>
                      )}

                      {/* Lado Derecho: Todos los controles horizontales con espacio amplio (Editar, Stepper, Eliminar) */}
                      <div className="d-flex align-items-center flex-shrink-0" style={{ gap: "6px" }}>
                        {estaEliminado ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success fw-bold py-0 px-2"
                            style={{ fontSize: "0.68rem", borderRadius: "4px" }}
                            onClick={() => handleRemoveItem(item.idUnicoCart)}
                            title="Restaurar este producto"
                          >
                            ↩ Restaurar
                          </button>
                        ) : (
                          <>
                            {/* Botón Notas / Observaciones */}
                            <button
                              type="button"
                              className="btn btn-sm d-flex align-items-center justify-content-center"
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                border: '1.5px solid #06b6d4',
                                color: '#06b6d4',
                                background: '#f0fdf4',
                                padding: 0
                              }}
                              onClick={() => handleEditObservacion(item.idUnicoCart)}
                              title="Editar observaciones"
                            >
                              <FiEdit size={16} />
                            </button>

                            {/* Control de Cantidad stepper +/- */}
                            <div className="d-flex align-items-center bg-light border rounded px-1.5" style={{ height: '32px', borderRadius: '6px' }}>
                              <button
                                type="button"
                                className="btn p-0 d-flex align-items-center justify-content-center fw-bold"
                                style={{ width: '24px', height: '24px', fontSize: '1.1rem', color: '#475569' }}
                                onClick={() => handleUpdateQty(item.idUnicoCart, -1)}
                              >
                                -
                              </button>
                              <span className="fw-bold px-1.5 text-dark" style={{ fontSize: '0.88rem', minWidth: '20px', textAlign: 'center' }}>
                                {item.cantidad}
                              </span>
                              <button
                                type="button"
                                className="btn p-0 d-flex align-items-center justify-content-center fw-bold"
                                style={{ width: '24px', height: '24px', fontSize: '1.1rem', color: '#475569' }}
                                onClick={() => handleUpdateQty(item.idUnicoCart, 1)}
                              >
                                +
                              </button>
                            </div>

                            {/* Botón Eliminar */}
                            <button
                              type="button"
                              className="co-btn-delete"
                              onClick={() => handleRemoveItem(item.idUnicoCart)}
                              aria-label={`Eliminar ${item.ProStDescripcion}`}
                              style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "6px" }}
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Observaciones (si las tiene) */}
                    {item.observacion && (
                      <div style={{ fontSize: "0.65rem", color: "#64748b", fontStyle: "italic", marginTop: "1px" }}>
                        📝 {item.observacion}
                      </div>
                    )}

                    {/* Adicionales (si los tiene) */}
                    {item.adicionales.length > 0 && (
                      <div className="co-cart-sides-box mt-1 border-start ps-2" style={{ fontSize: "0.65rem" }}>
                        {item.adicionales.map((ad, sIdx) => (
                          <div key={sIdx} className="co-cart-side-tag">
                            <span>{Number(ad.cantidad || 1).toFixed(1)} {ad.ProStDescripcion}</span>
                            {ad.precioVenta > 0 && (
                              <span className="co-cart-side-price">
                                +{formatMoneda(ad.precioVenta)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Panel 3: Detalle del Pedido */}
        <section className={`co-panel ${vistaMovil === "factura" ? "active" : ""}`}>
          <div className="co-bill-view" style={{ flex: 1, minHeight: "calc(100vh - 180px)", overflowY: "auto", touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}>
            {carrito.length === 0 ? (
              <div className="co-bill-empty">Carrito vacío</div>
            ) : (
              <table className="co-bill-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>CANT</th>
                    <th style={{ textAlign: "left" }}>PRODUCTO</th>
                    <th style={{ textAlign: "right" }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((item, idx) => {
                    const itemSidesPrice = item.adicionales.reduce((sum, ad) => sum + ad.precioVenta, 0);
                    const itemTotal = (item.precioVenta + itemSidesPrice) * item.cantidad;
                    const estaEliminado = Boolean(item.esEliminado);

                    return (
                      <tr 
                        key={idx} 
                        style={
                          estaEliminado 
                            ? { background: "#fef2f2" } 
                            : item.MopStImpreso === '1' 
                              ? { opacity: 0.65 } 
                              : {}
                        }
                      >
                        <td className="qty-col" style={{ color: estaEliminado ? "#dc2626" : item.MopStImpreso !== '1' ? "#000000" : "inherit", fontWeight: "bold", textDecoration: estaEliminado ? "line-through" : "none" }}>{Number(item.cantidad).toFixed(1)}</td>
                        <td>
                           <span
                            style={{
                              fontWeight: estaEliminado ? "bold" : item.MopStImpreso === '1' ? 'normal' : 'bold',
                              color: estaEliminado ? "#dc2626" : item.MopStImpreso === '1' ? 'inherit' : '#000000',
                              textDecoration: estaEliminado ? "line-through" : "none"
                            }}
                          >
                            {item.ProStDescripcion}
                          </span>
                          {estaEliminado && (
                            <Badge bg="danger" className="ms-2" style={{ fontSize: "0.65rem" }}>
                              ELIMINADO
                            </Badge>
                          )}
                          {item.observacion && (
                            <div style={{ fontSize: "0.75rem", color: "#d97706", fontWeight: "bold", marginTop: "2px" }}>
                              Obs: {item.observacion}
                            </div>
                          )}
                          {item.adicionales.length > 0 && (
                            <div className="co-bill-sides-list">
                              {item.adicionales.map((ad, sIdx) => (
                                <span key={sIdx} className="co-bill-side-item">
                                  {Number(ad.cantidad || 1).toFixed(1)} {ad.ProStDescripcion} {ad.precioVenta > 0 ? `(${formatMoneda(ad.precioVenta)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="total-col" style={{ textDecoration: estaEliminado ? "line-through" : "none", color: estaEliminado ? "#94a3b8" : "inherit" }}>
                          {estaEliminado ? "$0" : formatMoneda(itemTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="co-bill-summary">
              <div className="co-summary-line">
                <span>SUBTOTAL</span>
                <span>{formatMoneda(subtotal)}</span>
              </div>
              <div className="co-summary-line">
                <span>IVA</span>
                <span>{formatMoneda(resumenTotales.iva)}</span>
              </div>
              <div className="co-summary-line">
                <span>INC</span>
                <span>{formatMoneda(resumenTotales.impoconsumo)}</span>
              </div>
              <div className="co-summary-line grand-total">
                <span>TOTAL</span>
                <span>{formatMoneda(total)}</span>
              </div>
            </div>

            <div className="co-bill-actions-footer">
              <button
                type="button"
                className="co-btn-footer-secondary"
                onClick={() => clearForm()}
                disabled={!!ordenId}
                style={ordenId ? { opacity: 0.4, cursor: "not-allowed", pointerEvents: "auto" } : {}}
                title={ordenId ? "No puedes vaciar el carrito de una orden ya abierta" : "Vaciar carrito"}
              >
                VACIAR CARRITO
              </button>
              <button
                type="button"
                className="co-btn-footer-primary"
                onClick={guardarComanda}
                disabled={guardando || carrito.length === 0 || comanderaBloqueada}
                style={{
                  background: comanderaBloqueada ? "#94a3b8" : "#ef4444",
                  cursor: comanderaBloqueada ? "not-allowed" : "pointer"
                }}
              >
                {comanderaBloqueada ? "COMANDERA BLOQUEADA" : mandatoryPrint ? "IMPRIMIR" : "SOLO GUARDAR"}

              </button>
            </div>
          </div>
        </section>
        </div>
        </>
        )}
        </div>
      </div>

      {/* MODAL: Product Accompaniments modifier selection (Wizard paso a paso) */}
      <Modal
        show={modalSidesOpen}
        onHide={() => { setModalSidesOpen(false); setSelectedProduct(null); }}
        centered
        backdrop="static"
      >
        <div className="modal-header-premium d-flex justify-content-between align-items-center">
          <h5 className="modal-title-premium">
            {availableSides.length > 1 
              ? `Paso ${currentSideGroupIndex + 1} de ${availableSides.length}: ${(availableSides[currentSideGroupIndex]?.AprStDescripcion || "Acompañamientos").toUpperCase()}`
              : "Acompañamientos"}
          </h5>
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => { setModalSidesOpen(false); setSelectedProduct(null); }}
          ></button>
        </div>
        
        <div className="modal-body-premium">
          <div className="text-center mb-3">
            <span className="text-muted d-block text-uppercase fw-bold" style={{ fontSize: '0.7rem' }}>
              Producto Seleccionado
            </span>
            <h4 className="fw-bold text-danger text-uppercase mb-1" style={{ fontSize: '1.2rem' }}>
              {selectedProduct?.ProStDescripcion}
            </h4>
            <span className="fw-semibold text-muted" style={{ fontSize: '0.85rem' }}>
              Precio Base: {selectedProduct && formatMoneda(selectedProduct.precioVenta)}
            </span>
          </div>

          {/* Pestañas de Pasos si hay más de 1 grupo */}
          {availableSides.length > 1 && (
            <div className="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom overflow-auto">
              {availableSides.map((g, idx) => {
                const isCurrent = idx === currentSideGroupIndex;
                const targetQty = g.CprInCantidad * modalProductQty;
                const isOblig = esGrupoObligatorio(g);
                const minReq = targetQty > 0 ? targetQty : 1;
                const groupSelected = selectedSides[g.CprIdInAdicionales] || [];
                const totalInGroup = groupSelected.reduce((sum, s) => sum + s.cantidad, 0);
                const isDone = !isOblig ? totalInGroup > 0 : totalInGroup >= minReq;
                
                return (
                  <button
                    key={g.CprIdInAdicionales}
                    type="button"
                    onClick={() => {
                      if (idx > currentSideGroupIndex) {
                        for (let i = currentSideGroupIndex; i < idx; i++) {
                          const groupReq = availableSides[i];
                          const reqTarget = groupReq.CprInCantidad * modalProductQty;
                          const reqIsOblig = esGrupoObligatorio(groupReq);
                          const reqMin = reqTarget > 0 ? reqTarget : 1;
                          const selInGroup = (selectedSides[groupReq.CprIdInAdicionales] || []).reduce((sum, s) => sum + s.cantidad, 0);

                          if (reqIsOblig && selInGroup < reqMin) {
                            const faltantes = reqMin - selInGroup;
                            Swal.fire({
                              icon: "warning",
                              title: "Selección incompleta",
                              text: reqTarget > 0
                                ? `Debes seleccionar ${reqMin} opciones en "${groupReq.AprStDescripcion}" (${selInGroup}/${reqMin}). Faltan ${faltantes}.`
                                : `Debes elegir una opción para "${groupReq.AprStDescripcion}".`,
                              timer: 2500,
                              showConfirmButton: false,
                              toast: true,
                              position: "center"
                            });
                            setCurrentSideGroupIndex(i);
                            return;
                          }
                        }
                      }
                      setCurrentSideGroupIndex(idx);
                    }}
                    className={`btn btn-sm ${isCurrent ? "btn-danger" : isDone ? "btn-success" : "btn-outline-secondary"} rounded-pill fw-bold text-nowrap px-3`}
                    style={{ fontSize: "0.78rem" }}
                  >
                    {idx + 1}. {g.AprStDescripcion} {isDone ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* Renderizado exclusivo del grupo actual (Paso Activo) */}
          {(() => {
            const group = availableSides[currentSideGroupIndex] || availableSides[0];
            if (!group) return null;

            const targetQty = group.CprInCantidad * modalProductQty;
            const isObligatorio = esGrupoObligatorio(group);
            const minRequired = targetQty > 0 ? targetQty : 1;

            const currentSelected = selectedSides[group.CprIdInAdicionales] || [];
            const totalSelectedInGroup = currentSelected.reduce((sum, s) => sum + s.cantidad, 0);
            const isGroupDone = !isObligatorio ? totalSelectedInGroup > 0 : totalSelectedInGroup >= minRequired;

            return (
              <div key={group.CprIdInAdicionales} className="mb-3">
                <div className="accompaniment-group-title d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold text-uppercase">{group.AprStDescripcion}</span>
                    {isObligatorio && !isGroupDone && (
                      <span className="badge bg-warning text-dark px-2 py-1" style={{ fontSize: '0.7rem', fontWeight: '700' }}>
                        Requerido ({totalSelectedInGroup}/{minRequired})
                      </span>
                    )}
                  </div>
                  <Badge bg={!isObligatorio ? "secondary" : isGroupDone ? "success" : "danger"} className="rounded-pill px-3 py-1">
                    {!isObligatorio
                      ? "Opcional"
                      : isGroupDone
                        ? `✓ Seleccionado (${totalSelectedInGroup}/${targetQty || 1})`
                        : targetQty > 0
                          ? `Obligatorio (Elige ${targetQty}: ${totalSelectedInGroup}/${targetQty})`
                          : `Obligatorio (Elige al menos 1)`
                    }
                  </Badge>
                </div>

                <div className="accompaniment-options-list">
                  {group.acompanantes.map((opt) => {
                    const isSeparator = opt.ProStDescripcion.trim().startsWith("-") || opt.ProStDescripcion.includes("---");
                    if (isSeparator) {
                      return (
                        <div 
                          key={opt.ApmIdInProducto} 
                          className="co-accompaniment-separator-line"
                        />
                      );
                    }

                    const selectedItem = currentSelected.find(s => s.ApmIdInProducto === opt.ApmIdInProducto);
                    const isSelected = !!selectedItem;
                    
                    return (
                      <div
                        key={opt.ApmIdInProducto}
                        className={`accompaniment-option-item ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleSideSelection(group, opt)}
                        style={{ cursor: 'pointer', position: 'relative' }}
                      >
                        <div className="d-flex align-items-center justify-content-between w-100">
                          <div className="d-flex align-items-center gap-2">
                            {isSelected && <FiCheck className="text-danger fw-bold" size={16} />}
                            <span className="accompaniment-option-text">
                              {opt.ProStDescripcion}
                            </span>
                          </div>

                          <div className="d-flex align-items-center gap-2" onClick={e => e.stopPropagation()}>
                            {isSelected && targetQty > 1 && (
                              <div className="d-flex align-items-center gap-1 bg-white border rounded px-1" style={{ height: '26px' }}>
                                <button
                                  type="button"
                                  className="btn p-0 d-flex align-items-center justify-content-center fw-bold"
                                  style={{ width: '18px', height: '18px', fontSize: '0.85rem', color: '#64748b' }}
                                  onClick={() => adjustSideQty(group.CprIdInAdicionales, opt.ApmIdInProducto, -1)}
                                >
                                  -
                                </button>
                                <span className="fw-bold px-1" style={{ fontSize: '0.8rem', minWidth: '14px', textAlign: 'center', color: '#ef4444' }}>
                                  {selectedItem.cantidad}
                                </span>
                                <button
                                  type="button"
                                  className="btn p-0 d-flex align-items-center justify-content-center fw-bold"
                                  style={{ width: '18px', height: '18px', fontSize: '0.85rem', color: '#64748b' }}
                                  onClick={() => adjustSideQty(group.CprIdInAdicionales, opt.ApmIdInProducto, 1)}
                                  disabled={currentSelected.reduce((sum, s) => sum + s.cantidad, 0) >= targetQty}
                                >
                                  +
                                </button>
                              </div>
                            )}
                            
                            {opt.ApmInValorFijo > 0 && (
                              <span className="accompaniment-option-price">
                                +{formatMoneda(opt.ApmInValorFijo)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer con Navegación Anterior / Siguiente / Confirmar */}
        <div className="modal-footer-premium d-flex gap-2">
          {currentSideGroupIndex > 0 ? (
            <Button 
              variant="outline-secondary" 
              className="w-100 rounded-3 py-2 fw-bold" 
              onClick={() => setCurrentSideGroupIndex(prev => Math.max(0, prev - 1))}
            >
              ← Anterior
            </Button>
          ) : (
            <Button 
              variant="outline-secondary" 
              className="w-100 rounded-3 py-2 fw-bold" 
              onClick={() => { setModalSidesOpen(false); setSelectedProduct(null); }}
            >
              Cancelar
            </Button>
          )}

          {currentSideGroupIndex < availableSides.length - 1 ? (
            <Button 
              variant="danger" 
              className="w-100 rounded-3 py-2 fw-bold" 
              onClick={() => {
                const currentGroup = availableSides[currentSideGroupIndex];
                if (currentGroup) {
                  const targetQty = currentGroup.CprInCantidad * modalProductQty;
                  const isObligatorio = esGrupoObligatorio(currentGroup);
                  const groupSelected = selectedSides[currentGroup.CprIdInAdicionales] || [];
                  const totalSelected = groupSelected.reduce((sum, item) => sum + item.cantidad, 0);
                  const minRequired = targetQty > 0 ? targetQty : 1;

                  if (isObligatorio && totalSelected < minRequired) {
                    const faltantes = minRequired - totalSelected;
                    Swal.fire({
                      icon: "warning",
                      title: "Selección incompleta",
                      text: targetQty > 0
                        ? `Debes seleccionar ${minRequired} opciones en "${currentGroup.AprStDescripcion}" (${totalSelected}/${minRequired}). Faltan ${faltantes}.`
                        : `Debes elegir una opción para "${currentGroup.AprStDescripcion}".`,
                      timer: 2500,
                      showConfirmButton: false,
                      toast: true,
                      position: "center"
                    });
                    return;
                  }
                }
                setCurrentSideGroupIndex(prev => Math.min(availableSides.length - 1, prev + 1));
              }}
            >
              Siguiente →
            </Button>
          ) : (
            <Button 
              variant="danger" 
              className="w-100 rounded-3 py-2 fw-bold" 
              onClick={confirmSides}
            >
              Confirmar Acompañamiento
            </Button>
          )}
        </div>
      </Modal>


    </section>
  );
}
