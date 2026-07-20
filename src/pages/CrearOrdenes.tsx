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
  FiInfo,
  FiEdit
} from "react-icons/fi";
import { Modal, Button, Badge } from "react-bootstrap";
import Swal from "sweetalert2";
import { API_BASE_URL, sanitizarError } from "../config/api";
import "../styles/crear-ordenes.css";
import { descargarPDF, compartirPDF } from "../utils/pdf";

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
}

export default function CrearOrdenes({ initialOrdenId, onClearInitial }: CrearOrdenesProps = {}) {
  // Detalles de sesión obtenidos de localStorage
  const infoPuntoVenta = (() => {
    try {
      const stored = localStorage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const loggedVendedor = (() => {
    try {
      const stored = localStorage.getItem("vendedor");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const loggedUsuario = (() => {
    try {
      const stored = localStorage.getItem("usuario");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const esAdministrador = useMemo(() => {
    return loggedUsuario?.UsuStIdGrupoUsuario === "ADMS" || loggedUsuario?.UsuStIdGrupoUsuario === "ADM";
  }, [loggedUsuario]);

  const terminalName = localStorage.getItem("terminal") || "";
  const token = localStorage.getItem("token") || "";

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "empresa": infoPuntoVenta?.PveIdStEmpresa || "02",
    "bodega": String(infoPuntoVenta?.PveIdInBodega || "1"),
    "punto": String(infoPuntoVenta?.PveIdInPuntoVenta || "5")
  }), [token, infoPuntoVenta]);

  // Variables de estado
  const [mesa, setMesa] = useState("");
  const [ordenId, setOrdenId] = useState<string | number | null>(null);
  
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
  const infoSuperiorCompleta = cabeceraConfirmada;
  
  // Selectores de cantidad rápida por tarjeta de producto
  const [cantidadesRapidas, setCantidadesRapidas] = useState<Record<number, number>>({});
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



  const [guardando, setGuardando] = useState(false);
  const productSearchTimeout = useRef<number | undefined>(undefined);

  const fetchObservacionesPredefinidas = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/observaciones-predefinidas`, {
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
      const resp = await fetch(`${API_BASE_URL}/productos/lineas`, {
        headers
      });
      if (resp.ok) {
        const resData = await resp.json();
        setLineas(resData.body || []);
      }
    } catch (e) {
      console.error("Error loading product lines", e);
    }
  };

  // Establecer el mesero conectado inicialmente
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
          const resp = await fetch(`${API_BASE_URL}/ordenes/${initialOrdenId}`, {
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
                const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}`;
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
      const resp = await fetch(`${API_BASE_URL}/ordenes/waiters?search=${encodeURIComponent(term)}`, {
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
      const resp = await fetch(url, {
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
  const verificarMesa = async () => {
    if (!mesa.trim()) return;

    setCargandoComanda(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/mesa/${encodeURIComponent(mesa.trim())}`, {
        method: "GET",
        headers
      });

      if (resp.ok) {
        const resData = await resp.json();
        const comanda = resData.body;
        
        if (comanda) {
          setOrdenId(comanda.OpeIdInOrdenPedido);
          setNumPersonas(comanda.OpeInNumPersonas || 1);
          
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

          // Poblar los elementos del carrito
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
            const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}`;
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
              ProInIvaVenta: Number(p.ProInIvaVenta) || 0,
              ProInPorcentajeImpoconsumo: Number(p.ProInPorcentajeImpoconsumo) || 0,
              ProStIvaIncluido: p.ProStIvaIncluido !== undefined ? p.ProStIvaIncluido : '1',
              MopStImpreso: String(p.MopStImpreso || '0'),
              ImpNombre1: p.ImpNombre1 || "Comanda General",
              adicionales,
              observacion: observacion || ""
            };
          });

          setCarrito(itemsFormateados);
          setCabeceraConfirmada(true);

          Swal.fire({
            icon: "info",
            title: "Orden Cargada",
            text: `Se recuperó el pedido abierto #${comanda.OpeIdStDocumento} para la Mesa ${mesa}`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: "top-end"
          });
        }
      } else if (resp.status === 404) {
        // La mesa está libre
        setOrdenId(null);
        setCabeceraConfirmada(true);
        Swal.fire({
          icon: "success",
          title: "Mesa Libre",
          text: `Iniciando nueva orden para la Mesa ${mesa}`,
          timer: 2000,
          showConfirmButton: false,
          toast: true,
          position: "top-end"
        });
      }
    } catch (e) {
      console.error("Error verificando mesa", e);
    } finally {
      setCargandoComanda(false);
    }
  };

  // Agregar un producto (verifica los modificadores primero)
  const addProductToCart = async (p: Product) => {
    const customQty = cantidadesRapidas[p.ProIdInProducto] || 1;

    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/productos/${p.ProIdInProducto}/adicionales`, {
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

  const confirmSides = () => {
    if (!selectedProduct) return;
    const customQty = modalProductQty;

    // Validar grupos obligatorios
    for (const group of availableSides) {
      const isObligatorio = group.CprStObligatorio === "1" || group.CprInCantidad > 0;
      if (isObligatorio) {
        const groupSelected = selectedSides[group.CprIdInAdicionales] || [];
        const totalSelected = groupSelected.reduce((sum, item) => sum + item.cantidad, 0);

        if (totalSelected === 0) {
          Swal.fire({
            icon: "warning",
            title: "Selección requerida",
            text: `Debes elegir una opción para "${group.AprStDescripcion}"`,
            confirmButtonText: "Entendido",
            confirmButtonColor: "#ef4444"
          });
          return;
        }
      }
    }

    const sidesList: { ApmIdInProducto: number; ProStDescripcion: string; precioVenta: number; cantidad: number }[] = [];
    
    Object.values(selectedSides).forEach(groupSelected => {
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
    const sidesKey = sides.map(s => s.ApmIdInProducto).sort().join(",");
    const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}`;

    setCarrito(prev => {
      const existIdx = prev.findIndex(item => item.idUnicoCart === idUnicoCart);
      
      if (existIdx !== -1) {
        const newCart = [...prev];
        newCart[existIdx].cantidad += customQty;
        return newCart;
      } else {
        return [
          ...prev,
          {
            idUnicoCart,
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
            adicionales: sides
          }
        ];
      }
    });

    // Restablecer el contador de cantidad rápida
    setCantidadesRapidas(prev => ({ ...prev, [p.ProIdInProducto]: 1 }));

    Swal.fire({
      icon: "success",
      title: "Agregado",
      text: `${p.ProStDescripcion} agregado al pedido`,
      timer: 1000,
      showConfirmButton: false,
      toast: true,
      position: "top-end"
    });
  };

  const cambiarCantidadRapida = (id: number, val: number) => {
    setCantidadesRapidas(prev => ({
      ...prev,
      [id]: Math.max(1, val)
    }));
  };

  const handleEditObservacion = (idUnicoCart: string) => {
    const item = carrito.find(x => x.idUnicoCart === idUnicoCart);
    if (!item) return;

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
      const resp = await fetch(`${API_BASE_URL}/ordenes/validar-admin`, {
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

    // Si se está disminuyendo la cantidad
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

    setCarrito(prev => {
      const idx = prev.findIndex(x => x.idUnicoCart === idUnicoCart);
      if (idx === -1) return prev;

      const newCart = [...prev];
      const newQty = newCart[idx].cantidad + delta;
      
      if (newQty <= 0) {
        return newCart.filter(x => x.idUnicoCart !== idUnicoCart);
      } else {
        newCart[idx].cantidad = newQty;
        return newCart;
      }
    });
  };

  const handleRemoveItem = async (idUnicoCart: string) => {
    const item = carrito.find(x => x.idUnicoCart === idUnicoCart);
    if (!item) return;

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
    }

    setCarrito(prev => prev.filter(x => x.idUnicoCart !== idUnicoCart));
  };

  const clearForm = () => {
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

    carrito.forEach(item => {
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

  const subtotal = resumenTotales.total;
  const total = resumenTotales.total;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
  };



  const reintentarImpresionManual = async (nroOrden: string | number) => {
    Swal.fire({
      title: "Reintentando impresión...",
      text: "Conectando con la impresora...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const resp = await fetch(`${API_BASE_URL}/ordenes/${nroOrden}/imprimir`, {
        method: "POST",
        headers,
        body: JSON.stringify({ esReimpresion: false })
      });

      const resData = await resp.json();
      Swal.close();

      if (resp.ok && resData.body?.success !== false) {
        Swal.fire({
          icon: "success",
          title: "Impresión exitosa",
          text: `Comanda #${nroOrden} enviada a la impresora.`,
          timer: 1500,
          showConfirmButton: false
        });
        clearForm();
        if (onClearInitial) onClearInitial();
      } else {
        Swal.fire({
          icon: "warning",
          title: "No se pudo imprimir",
          text: resData.mensaje || resData.body?.error || "La impresora no respondió. Revisa la conexión e intenta de nuevo.",
          showCancelButton: true,
          confirmButtonText: "🔄 Reintentar nuevamente",
          cancelButtonText: "Continuar sin imprimir",
          confirmButtonColor: "#eab308",
          cancelButtonColor: "#64748b"
        }).then((r) => {
          if (r.isConfirmed) {
            reintentarImpresionManual(nroOrden);
          } else {
            clearForm();
            if (onClearInitial) onClearInitial();
          }
        });
      }
    } catch (e) {
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Error de Conexión",
        text: "No se pudo comunicar con el servicio de impresión.",
        confirmButtonColor: "#ef4444"
      });
    }
  };

  // Guardar/Actualizar la orden en la base de datos
  const guardarComanda = async () => {
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

    Swal.fire({
      title: ordenId ? "Actualizando Pedido" : "Procesando Pedido",
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
        OpeIdStComprobante: infoPuntoVenta?.PveIdStComprobante || "28",
        nombre_terminal: terminalName,
        productos: carrito.map(item => ({
          ProIdInProducto: item.ProIdInProducto,
          precioVenta: item.precioVenta,
          cantidad: item.cantidad,
          ProIdInUnidadVenta: item.ProIdInUnidadVenta,
          MopStImpreso: item.MopStImpreso || '0',
          observacion: item.observacion || "",
          adicionales: item.adicionales.map(ad => ({
            ApmIdInProducto: ad.ApmIdInProducto,
            precioVenta: ad.precioVenta
          }))
        }))
      };

      const url = ordenId 
        ? `${API_BASE_URL}/ordenes/${ordenId}`
        : `${API_BASE_URL}/ordenes`;

      const method = ordenId ? "PUT" : "POST";

      const resp = await fetch(url, {
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

      Swal.close();

      const impStatus = resData?.body?.impresion;
      const falloImpresion = impStatus && impStatus.success === false;

      if (falloImpresion) {
        const ordenActualId = resData.body.nro_orden;

        Swal.fire({
          icon: "warning",
          title: "Orden Guardada en Sistema",
          html: `La orden para la <b>Mesa ${mesa}</b> (#${ordenActualId}) <b>se guardó correctamente</b>.<br/><br/><span style="color: #ef4444; font-weight: 700;">⚠️ Advertencia de Impresión:</span><br/>${impStatus.error || "La impresora no respondió."}<br/><br/>¿Deseas reintentar la impresión?`,
          showCancelButton: true,
          confirmButtonText: "🔄 Reintentar Impresión",
          cancelButtonText: "Continuar sin imprimir",
          confirmButtonColor: "#eab308",
          cancelButtonColor: "#64748b"
        }).then((result) => {
          if (result.isConfirmed) {
            reintentarImpresionManual(ordenActualId);
          } else {
            clearForm();
            if (onClearInitial) onClearInitial();
          }
        });
        return;
      }

      // Preparar los detalles del pedido para el ticket PDF
      const now = new Date();
      const fecha = now.toISOString().split('T')[0];
      const hora = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const ticketOrden = {
        nro_orden: resData.body.nro_orden,
        mesa: mesa.trim(),
        mesero: mesero?.nombre || "VENDEDOR",
        numPersonas: Number(numPersonas) || 1,
        fecha,
        hora,
        productos: carrito.map(item => ({
          cantidad: item.cantidad,
          ProStDescripcion: item.ProStDescripcion,
          precioVenta: item.precioVenta,
          total: (item.precioVenta + item.adicionales.reduce((acc, ad) => acc + ad.precioVenta, 0)) * item.cantidad,
          adicionales: item.adicionales.map(ad => ({
            ProStDescripcion: ad.ProStDescripcion
          })),
          MopStImpreso: item.MopStImpreso || '0',
          ImpNombre1: item.ImpNombre1 || "Comanda General"
        })),
        totales: {
          subtotal: resumenTotales.total - resumenTotales.iva - resumenTotales.impoconsumo,
          iva: resumenTotales.iva,
          impoconsumo: resumenTotales.impoconsumo,
          total: resumenTotales.total
        }
      };

      const ticketEmpresa = {
        nombre: infoPuntoVenta?.gmpnomb || "DIANASIS RESTAURANTE",
        puntoVenta: infoPuntoVenta?.PveStNombre || "COMANDERA",
        empresaId: infoPuntoVenta?.PveIdStEmpresa || "02"
      };

      Swal.fire({
        icon: "success",
        title: ordenId ? "Pedido Enviado e Impreso" : "Pedido Registrado e Impreso",
        text: `Mesa: ${mesa} - Orden: #${resData.body.nro_orden}`,
        showCancelButton: true,
        confirmButtonText: "Compartir Ticket",
        cancelButtonText: "Aceptar",
        confirmButtonColor: "#22c55e",
        cancelButtonColor: "#3b82f6"
      }).then(async (result) => {
        if (result.isConfirmed) {
          Swal.fire({
            title: "Generando PDF...",
            text: "Por favor espera un momento...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            }
          });

          const exitoShare = await compartirPDF(ticketOrden, ticketEmpresa);
          Swal.close();

          if (!exitoShare) {
            await descargarPDF(ticketOrden, ticketEmpresa);
          }
        }
        clearForm();
        if (onClearInitial) onClearInitial();
      });
    } catch (err) {
      Swal.close();
      const msg = err instanceof Error ? err.message : "Error al guardar";
      Swal.fire({
        icon: "error",
        title: "Error al guardar",
        text: sanitizarError(msg)
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="crear-ordenes-page px-0 px-md-3" aria-label="Crear Órdenes">
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
        {/* Header Strip */}
        <header className="co-header">
          <div className="d-flex align-items-center gap-3">
            {onClearInitial && (
              <button
                type="button"
                title="Volver a órdenes abiertas"
                onClick={() => {
                  if (carrito.length > 0) {
                    Swal.fire({
                      icon: "question",
                      title: "¿Salir sin guardar?",
                      text: "Tienes productos en el carrito. ¿Deseas salir de todas formas?",
                      showCancelButton: true,
                      confirmButtonColor: "#ef4444",
                      cancelButtonColor: "#64748b",
                      confirmButtonText: "Sí, salir",
                      cancelButtonText: "Cancelar"
                    }).then((result) => {
                      if (result.isConfirmed) onClearInitial();
                    });
                  } else {
                    onClearInitial();
                  }
                }}
                style={{
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.75)",
                  width: "34px",
                  height: "34px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontSize: "1rem",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.9)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#ef4444"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.15)"; }}
              >
                &#8592;
              </button>
            )}
            <div
              style={{
                width: "36px",
                height: "36px",
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                color: "#fff",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 3px 10px rgba(239,68,68,0.4)",
              }}
            >
              <FiLayers size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="co-header-subtitle">
                {ordenId ? "Comanda" : "Nuevo pedido"}
              </div>
              <h1 className="co-header-title">
                {ordenId ? `#${ordenId}` : "PEDIDOS"}
              </h1>
            </div>
          </div>
          <div className="co-total-desktop">
            <span>Total</span>
            <strong>{formatMoneda(total)}</strong>
          </div>
        </header>


        {/* Filters Strip */}
        <div className="co-filters-strip">
          <div className="row g-3 align-items-end">
            {/* Table / Mesa */}
            <div className="col-12 col-md-3">
              <label className="co-form-label">Digite Mesa</label>
              <div className="co-input-box" style={{ opacity: cabeceraConfirmada ? 0.75 : 1 }}>
                <FiGrid size={16} />
                <input
                  type="text"
                  value={mesa}
                  onChange={(e) => setMesa(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (!mesa.trim()) {
                        Swal.fire({
                          icon: "error",
                          title: "Mesa Requerida",
                          text: "Falta ingresar la mesa.",
                          confirmButtonColor: "#ef4444"
                        });
                        return;
                      }
                      if (!mesero) {
                        Swal.fire({
                          icon: "error",
                          title: "Mesero Requerido",
                          text: "Falta seleccionar el mesero responsable.",
                          confirmButtonColor: "#ef4444"
                        });
                        return;
                      }
                      verificarMesa();
                    }
                  }}
                  placeholder="Mesa o Barra..."
                  disabled={cabeceraConfirmada}
                />
              </div>
            </div>

            {/* Waiter / Mesero Autocomplete */}
            <div className="col-12 col-md-4">
              <label className="co-form-label">Mesero Responsable</label>
              <div className="co-input-box" style={{ opacity: (cabeceraConfirmada || !esAdministrador) ? 0.75 : 1 }}>
                <FiUser size={16} />
                <input
                  type="text"
                  value={meseroBusqueda}
                  onChange={(e) => handleMeseroChange(e.target.value)}
                  onFocus={() => { if (!cabeceraConfirmada && esAdministrador) setShowWaitersList(true); }}
                  placeholder="Escriba nombre o cédula..."
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
                        style={{ border: 0, background: "transparent", color: "#ef4444", fontSize: "0.7rem", fontWeight: "bold" }}
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

            {/* Guest Counter */}
            <div className="col-12 col-md-2">
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

            {/* Botón Aceptar Permanente */}
            <div className="col-12 col-md-3">
              <button
                type="button"
                className="btn btn-danger w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
                style={{
                  borderRadius: "10px",
                  fontFamily: "'Outfit', sans-serif",
                  height: "44px",
                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)",
                  border: "none",
                  color: "#fff",
                  opacity: cabeceraConfirmada ? 0.6 : 1,
                  cursor: cabeceraConfirmada ? "not-allowed" : "pointer"
                }}
                disabled={cabeceraConfirmada}
                onClick={async () => {
                  if (!mesa.trim()) {
                    Swal.fire({
                      icon: "error",
                      title: "Mesa Requerida",
                      text: "Falta ingresar la mesa.",
                      confirmButtonColor: "#ef4444"
                    });
                    return;
                  }
                  if (!mesero) {
                    Swal.fire({
                      icon: "error",
                      title: "Mesero Requerido",
                      text: "Falta seleccionar el mesero responsable.",
                      confirmButtonColor: "#ef4444"
                    });
                    return;
                  }
                  await verificarMesa();
                }}
              >
                <FiCheck size={18} />
                {cabeceraConfirmada ? "ACEPTADO" : "ACEPTAR"}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navbar Switcher matching screenshots 2 & 3 */}
        <nav className="co-tabs-navbar">
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

        {/* Panels */}
        
        {/* Panel 1: Productos */}
        <section className={`co-panel ${vistaMovil === "productos" ? "active" : ""}`}>
          
          {infoSuperiorCompleta && (
            <div className="d-flex gap-2 mb-2 mt-3 justify-content-start">
              <button
                type="button"
                className={`btn d-flex align-items-center justify-content-center gap-1 py-1 px-3 fw-bold ${subTabProductos === "productos" ? "btn-danger text-white" : "btn-outline-secondary bg-white"}`}
                style={{ borderRadius: '6px', fontSize: '0.72rem', minHeight: '30px' }}
                onClick={() => setSubTabProductos("productos")}
              >
                <FiGrid size={13} /> PRODUCTOS
              </button>
              <button
                type="button"
                className={`btn d-flex align-items-center justify-content-center gap-1 py-1 px-3 fw-bold ${subTabProductos === "categorias" ? "btn-danger text-white" : "btn-outline-secondary bg-white"}`}
                style={{ borderRadius: '6px', fontSize: '0.72rem', minHeight: '30px' }}
                onClick={() => setSubTabProductos("categorias")}
              >
                <FiLayers size={13} /> CATEGORÍAS
              </button>
            </div>
          )}

          {subTabProductos === "categorias" && infoSuperiorCompleta ? (
            <div 
              className="co-categories-grid mb-3" 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '10px', 
                maxHeight: 'calc(100vh - 280px)', 
                overflowY: 'auto', 
                paddingRight: '4px' 
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
                      setSubTabProductos("productos");
                    }}
                  >
                    {(linea.descripcion || "").toUpperCase()}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="co-search-bar mb-2" style={{ opacity: infoSuperiorCompleta ? 1 : 0.6 }}>
                <FiSearch size={16} />
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  placeholder="BUSCAR PRODUCTO O CODIGO"
                  disabled={!infoSuperiorCompleta}
                />
              </div>

              {infoSuperiorCompleta && lineaSeleccionada !== null && (
                <div 
                  className="alert alert-info py-2 px-3 mb-2 d-flex align-items-center justify-content-between" 
                  style={{ 
                    borderRadius: '8px', 
                    background: '#eff6ff', 
                    border: '1px solid #dbeafe', 
                    color: '#1e40af', 
                    fontSize: '0.8rem', 
                    fontWeight: 'bold' 
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

          <div className="co-products-scroll" style={{ display: subTabProductos === "categorias" && infoSuperiorCompleta ? "none" : "block" }}>
            {!infoSuperiorCompleta ? (
              <div 
                className="d-flex flex-column align-items-center justify-content-center text-center py-5 px-3"
                style={{
                  background: "#fdf2f2",
                  borderRadius: "12px",
                  border: "1px dashed #fca5a5",
                  marginTop: "20px",
                  minHeight: "180px"
                }}
              >
                <div 
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "#fee2e2",
                    color: "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "12px"
                  }}
                >
                  <FiInfo size={24} />
                </div>
                <h5 className="fw-bold text-danger mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Información Requerida</h5>
                <p className="text-muted small m-0" style={{ maxWidth: "280px" }}>
                  Por favor, digite la mesa y seleccione el mesero responsable para comenzar a agregar productos.
                </p>
              </div>
            ) : cargandoProductos && productos.length === 0 ? (
              <div className="text-center py-5 text-muted">Buscando productos...</div>
            ) : productos.length === 0 ? (
              <div className="text-center py-5 text-muted">No hay productos para mostrar</div>
            ) : (
              productos.map((p) => {
                const qty = cantidadesRapidas[p.ProIdInProducto] || 1;
                return (
                  <article key={p.ProIdInProducto} className="co-product-row">
                    <div className="co-product-info">
                      <strong className="co-product-name">{p.ProStDescripcion}</strong>
                      <div className="co-product-meta">
                        <span className="co-meta-code">COD. {p.ProIdInProducto}</span>
                      </div>
                    </div>
                    
                    <div className="d-flex align-items-center gap-3">
                      <span className="co-price">{formatMoneda(p.precioVenta)}</span>
                      
                      <div className="co-qty-compact">
                        <button
                          type="button"
                          onClick={() => cambiarCantidadRapida(p.ProIdInProducto, qty - 1)}
                          aria-label="Disminuir"
                        >
                          <FiMinus size={10} />
                        </button>
                        <input
                          type="text"
                          value={qty}
                          onChange={(e) => cambiarCantidadRapida(p.ProIdInProducto, Number(e.target.value) || 1)}
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          type="button"
                          onClick={() => cambiarCantidadRapida(p.ProIdInProducto, qty + 1)}
                          aria-label="Aumentar"
                        >
                          <FiPlus size={10} />
                        </button>
                      </div>

                      <button
                        type="button"
                        className="co-btn-add"
                        onClick={() => addProductToCart(p)}
                        aria-label={`Añadir ${p.ProStDescripcion}`}
                      >
                        <FiPlus size={14} />
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
          <div className="co-panel-header">
            <h2>CARRITO DE PRODUCTOS</h2>
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
              carrito.map((item) => {
                const sidesPrice = item.adicionales.reduce((sum, ad) => sum + ad.precioVenta, 0);
                const itemTotal = (item.precioVenta + sidesPrice) * item.cantidad;

                 return (
                  <article 
                    key={item.idUnicoCart} 
                    className="co-cart-item"
                    style={item.MopStImpreso === '1' ? { opacity: 0.55 } : {}}
                  >
                    {/* Fila Superior: Nombre del producto y Boton eliminar */}
                    <div className="co-cart-item-row-top">
                      <div className="d-flex flex-column" style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            fontWeight: item.MopStImpreso === '1' ? 'normal' : 'bold',
                            color: item.MopStImpreso === '1' ? 'inherit' : '#1e293b',
                            fontSize: '0.8rem',
                            textTransform: 'uppercase',
                            lineHeight: '1.2'
                          }}
                        >
                          {item.ProStDescripcion}
                        </span>
                      </div>
                      
                      <button
                        type="button"
                        className="co-btn-delete"
                        onClick={() => handleRemoveItem(item.idUnicoCart)}
                        aria-label={`Eliminar ${item.ProStDescripcion}`}
                        style={{ flexShrink: 0 }}
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </div>

                    {/* Fila Inferior: Precio e Indicadores de cantidad y notas */}
                    <div className="co-cart-item-row-bottom">
                      <span className="co-cart-total" style={{ color: '#16a34a', fontSize: '0.82rem', fontWeight: '800' }}>
                        {formatMoneda(itemTotal)}
                      </span>

                      <div className="d-flex align-items-center gap-2">
                        {/* Botón Notas */}
                        <button
                          type="button"
                          className="btn btn-sm d-flex align-items-center justify-content-center"
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: '1.5px solid #06b6d4',
                            color: '#06b6d4',
                            background: 'transparent',
                            padding: 0
                          }}
                          onClick={() => handleEditObservacion(item.idUnicoCart)}
                          title="Editar observaciones"
                        >
                          <FiEdit size={12} />
                        </button>

                        {/* Control de Cantidad Premium */}
                        <div className="d-flex align-items-center bg-light border rounded px-1" style={{ height: '26px' }}>
                          <button
                            type="button"
                            className="btn p-0 d-flex align-items-center justify-content-center fw-bold"
                            style={{ width: '18px', height: '18px', fontSize: '0.85rem', color: '#64748b' }}
                            onClick={() => handleUpdateQty(item.idUnicoCart, -1)}
                          >
                            -
                          </button>
                          <span className="fw-bold px-2 text-dark" style={{ fontSize: '0.78rem', minWidth: '16px', textAlign: 'center' }}>
                            {item.cantidad}
                          </span>
                          <button
                            type="button"
                            className="btn p-0 d-flex align-items-center justify-content-center fw-bold"
                            style={{ width: '18px', height: '18px', fontSize: '0.85rem', color: '#64748b' }}
                            onClick={() => handleUpdateQty(item.idUnicoCart, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Observaciones (si las tiene) */}
                    {item.observacion && (
                      <div 
                        style={{ 
                          fontSize: "0.72rem", 
                          color: "#d97706", 
                          background: "#fffbeb", 
                          border: "1px solid #fef3c7", 
                          borderRadius: "6px",
                          padding: "4px 8px", 
                          marginTop: "8px", 
                          fontWeight: "600",
                          fontFamily: "'Outfit', sans-serif"
                        }}
                      >
                        Obs: {item.observacion}
                      </div>
                    )}

                    {/* Adicionales (si los tiene) */}
                    {item.adicionales.length > 0 && (
                      <div className="co-cart-sides-box" style={{ gridColumn: 'auto', marginTop: '8px', borderLeft: '2px solid #e2e8f0', paddingLeft: '8px' }}>
                        {item.adicionales.map((ad, sIdx) => (
                          <div key={sIdx} className="co-cart-side-tag">
                            <span>+ {ad.ProStDescripcion} {ad.cantidad > 1 ? `x${ad.cantidad}` : ""}</span>
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
          <div className="co-panel-header" style={{ background: "#1e293b" }}>
            <h2 style={{ color: "#ffffff" }}>DETALLE DEL PEDIDO</h2>
          </div>

          <div className="co-bill-view">
            {carrito.length === 0 ? (
              <div className="co-bill-empty">Carrito vacío</div>
            ) : (
              <table className="co-bill-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>CANT</th>
                    <th style={{ textAlign: "left" }}>PRODUCTO</th>
                    <th style={{ textAlign: "right" }}>PRECIO</th>
                    <th style={{ textAlign: "right" }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((item, idx) => {
                    const itemSidesPrice = item.adicionales.reduce((sum, ad) => sum + ad.precioVenta, 0);
                    const itemTotal = (item.precioVenta + itemSidesPrice) * item.cantidad;

                    return (
                      <tr key={idx} style={item.MopStImpreso === '1' ? { opacity: 0.55 } : {}}>
                        <td className="qty-col" style={item.MopStImpreso !== '1' ? { color: "#000000", fontWeight: "bold" } : {}}>{item.cantidad}</td>
                        <td>
                           <span
                            style={{
                              fontWeight: item.MopStImpreso === '1' ? 'normal' : 'bold',
                              color: item.MopStImpreso === '1' ? 'inherit' : '#000000'
                            }}
                          >
                            {item.ProStDescripcion}
                          </span>
                          {item.observacion && (
                            <div style={{ fontSize: "0.75rem", color: "#d97706", fontWeight: "bold", marginTop: "2px" }}>
                              Obs: {item.observacion}
                            </div>
                          )}
                          {item.adicionales.length > 0 && (
                            <div className="co-bill-sides-list">
                              {item.adicionales.map((ad, sIdx) => (
                                <span key={sIdx} className="co-bill-side-item">
                                  + {ad.ProStDescripcion} {ad.cantidad > 1 ? `x${ad.cantidad}` : ""} {ad.precioVenta > 0 ? `(${formatMoneda(ad.precioVenta)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="price-col">{formatMoneda(item.precioVenta)}</td>
                        <td className="total-col">{formatMoneda(itemTotal)}</td>
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
                onClick={clearForm}
              >
                VACIAR CARRITO
              </button>
              <button
                type="button"
                className="co-btn-footer-primary"
                onClick={guardarComanda}
                disabled={guardando || carrito.length === 0}
                style={{ background: "#ef4444" }}
              >
                ENVIAR E IMPRIMIR PEDIDO
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* MODAL: Product Accompaniments modifier selection */}
      <Modal
        show={modalSidesOpen}
        onHide={() => { setModalSidesOpen(false); setSelectedProduct(null); }}
        centered
        backdrop="static"
      >
        <div className="modal-header-premium d-flex justify-content-between align-items-center">
          <h5 className="modal-title-premium">Acompañamientos</h5>
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => { setModalSidesOpen(false); setSelectedProduct(null); }}
          ></button>
        </div>
        
        <div className="modal-body-premium">
          <div className="text-center mb-4">
            <span className="text-muted d-block text-uppercase fw-bold" style={{ fontSize: '0.7rem' }}>
              Producto Seleccionado
            </span>
            <h4 className="fw-bold text-danger text-uppercase mb-1" style={{ fontSize: '1.25rem' }}>
              {selectedProduct?.ProStDescripcion}
            </h4>
            <span className="fw-semibold text-muted" style={{ fontSize: '0.85rem' }}>
              Precio Base: {selectedProduct && formatMoneda(selectedProduct.precioVenta)}
            </span>
          </div>

          {availableSides.map((group) => {
            const currentSelected = selectedSides[group.CprIdInAdicionales] || [];
            const isObligatorio = group.CprStObligatorio === "1" || group.CprInCantidad > 0;
            const totalSelectedInGroup = currentSelected.reduce((sum, s) => sum + s.cantidad, 0);

            return (
              <div key={group.CprIdInAdicionales} className="mb-4">
                <div className="accompaniment-group-title d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold">{group.AprStDescripcion}</span>
                    {isObligatorio && totalSelectedInGroup === 0 && (
                      <span className="badge bg-warning text-dark px-2 py-1" style={{ fontSize: '0.7rem', fontWeight: '700' }}>
                        Requerido
                      </span>
                    )}
                  </div>
                  <Badge bg={!isObligatorio ? "secondary" : (totalSelectedInGroup > 0 ? "success" : "danger")} className="rounded-pill px-3 py-1">
                    {!isObligatorio
                      ? "Opcional"
                      : totalSelectedInGroup > 0
                        ? `✓ Seleccionado (${totalSelectedInGroup}/${group.CprInCantidad * modalProductQty})`
                        : `Obligatorio (Elige 1 a ${group.CprInCantidad * modalProductQty})`
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
                            {isSelected && (group.CprInCantidad * modalProductQty) > 1 && (
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
                                  disabled={currentSelected.reduce((sum, s) => sum + s.cantidad, 0) >= (group.CprInCantidad * modalProductQty)}
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
          })}
        </div>

        <div className="modal-footer-premium d-flex gap-3">
          <Button 
            variant="outline-secondary" 
            className="w-100 rounded-3 py-2" 
            onClick={() => { setModalSidesOpen(false); setSelectedProduct(null); }}
          >
            Cancelar
          </Button>
          <Button 
            variant="danger" 
            className="w-100 rounded-3 py-2" 
            onClick={confirmSides}
          >
            Confirmar Acompañamiento
          </Button>
        </div>
      </Modal>


    </section>
  );
}
