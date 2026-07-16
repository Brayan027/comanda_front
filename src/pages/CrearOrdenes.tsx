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
  FiCheck
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
  adicionales: {
    ApmIdInProducto: number;
    ProStDescripcion: string;
    precioVenta: number;
    cantidad: number;
  }[];
}



type VistaMovil = "productos" | "carrito" | "factura";

interface CrearOrdenesProps {
  initialOrdenId?: number | null;
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
  const [ordenId, setOrdenId] = useState<number | null>(null);
  
  // Estado para el autocompletado de meseros
  const [meseroBusqueda, setMeseroBusqueda] = useState("");
  const [mesero, setMesero] = useState<Waiter | null>(null);
  const [waitersSuggestions, setWaitersSuggestions] = useState<Waiter[]>([]);
  const [showWaitersList, setShowWaitersList] = useState(false);

  const [numPersonas, setNumPersonas] = useState(1);
  const [vistaMovil, setVistaMovil] = useState<VistaMovil>("productos");
  
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [productos, setProductos] = useState<Product[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [cargandoComanda, setCargandoComanda] = useState(false);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  
  // Selectores de cantidad rápida por tarjeta de producto
  const [cantidadesRapidas, setCantidadesRapidas] = useState<Record<number, number>>({});

  // Modales
  const [modalSidesOpen, setModalSidesOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [availableSides, setAvailableSides] = useState<SelectionGroup[]>([]);
  const [selectedSides, setSelectedSides] = useState<Record<number, AccompanimentOption[]>>({}); // Indexado por ID del grupo de selección (SelectionGroup)



  const [guardando, setGuardando] = useState(false);
  const productSearchTimeout = useRef<number | undefined>(undefined);

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
                  cantidad: ad.cantidad
                }));

                const sidesKey = adicionales
                  .map((ad: any) => ad.ApmIdInProducto)
                  .sort()
                  .join(",");
                const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}`;

                return {
                  idUnicoCart,
                  ProIdInProducto: p.ProIdInProducto,
                  ProStDescripcion: p.ProStDescripcion,
                  precioVenta: p.valor,
                  cantidad: p.cantidad,
                  ProIdInUnidadVenta: p.MopIdInUnidadVenta || 1,
                  ProInCosto: p.MopInCosto || 0,
                  ProInIvaVenta: p.MopInPorIva || 0,
                  ProInPorcentajeImpoconsumo: p.MopInPorcentajeImpoconsumo || 0,
                  ProStIvaIncluido: p.MopInPorIva > 0 || p.MopInPorcentajeImpoconsumo > 0 ? "1" : "0",
                  MopStImpreso: String(p.MopStImpreso || '0'),
                  adicionales
                };
              });

              setCarrito(itemsFormateados);
            }
          }
        } catch (e) {
          console.error("Error loading initial comanda by ID", e);
        } finally {
          setCargandoComanda(false);
          if (onClearInitial) onClearInitial();
        }
      };
      loadComanda();
    }
  }, [initialOrdenId]);

  // Obtener la lista de productos al cambiar el término de búsqueda (con Debounce)
  useEffect(() => {
    if (productSearchTimeout.current) clearTimeout(productSearchTimeout.current);
    productSearchTimeout.current = setTimeout(cargarProductos, 300);

    return () => {
      if (productSearchTimeout.current) clearTimeout(productSearchTimeout.current);
    };
  }, [busquedaProducto]);

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
      const url = `${API_BASE_URL}/ordenes/productos?search=${encodeURIComponent(busquedaProducto)}&limit=${limit}`;
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
              cantidad: ad.cantidad
            }));

            const sidesKey = adicionales
              .map((ad: any) => ad.ApmIdInProducto)
              .sort()
              .join(",");
            const idUnicoCart = `${p.ProIdInProducto}_${sidesKey}`;

            return {
              idUnicoCart,
              ProIdInProducto: p.ProIdInProducto,
              ProStDescripcion: p.ProStDescripcion,
              precioVenta: p.valor,
              cantidad: p.cantidad,
              ProIdInUnidadVenta: p.MopIdInUnidadVenta || 1,
              ProInCosto: p.MopInCosto || 0,
              ProInIvaVenta: Number(p.ProInIvaVenta) || 0,
              ProInPorcentajeImpoconsumo: Number(p.ProInPorcentajeImpoconsumo) || 0,
              ProStIvaIncluido: p.ProStIvaIncluido !== undefined ? p.ProStIvaIncluido : '1',
              MopStImpreso: String(p.MopStImpreso || '0'),
              adicionales
            };
          });

          setCarrito(itemsFormateados);

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
          
          const initialSelection: Record<number, AccompanimentOption[]> = {};
          sideGroups.forEach(g => {
            initialSelection[g.CprIdInAdicionales] = [];
          });
          setSelectedSides(initialSelection);
          
          setModalSidesOpen(true);
        } else {
          executeAddToCart(p, [], customQty);
        }
      }
    } catch (e) {
      console.error("Error al obtener modificadores", e);
    }
  };

  // Manejar la elección de acompañamientos / adicionales
  const toggleSideSelection = (group: SelectionGroup, opt: AccompanimentOption) => {
    const groupId = group.CprIdInAdicionales;
    const currentSelected = selectedSides[groupId] || [];
    const exists = currentSelected.some(s => s.ApmIdInProducto === opt.ApmIdInProducto);

    let updatedList = [];
    if (exists) {
      updatedList = currentSelected.filter(s => s.ApmIdInProducto !== opt.ApmIdInProducto);
    } else {
      if (group.CprInCantidad > 0 && currentSelected.length >= group.CprInCantidad) {
        if (group.CprInCantidad === 1) {
          updatedList = [opt];
        } else {
          Swal.fire({
            icon: "warning",
            title: "Límite superado",
            text: `Solo puedes elegir hasta ${group.CprInCantidad} opciones en "${group.AprStDescripcion}"`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: "center"
          });
          return;
        }
      } else {
        updatedList = [...currentSelected, opt];
      }
    }

    setSelectedSides(prev => ({
      ...prev,
      [groupId]: updatedList
    }));
  };

  const confirmSides = () => {
    if (!selectedProduct) return;
    const customQty = cantidadesRapidas[selectedProduct.ProIdInProducto] || 1;

    const sidesList: { ApmIdInProducto: number; ProStDescripcion: string; precioVenta: number; cantidad: number }[] = [];
    
    Object.values(selectedSides).forEach(groupSelected => {
      groupSelected.forEach(opt => {
        sidesList.push({
          ApmIdInProducto: opt.ApmIdInProducto,
          ProStDescripcion: opt.ProStDescripcion,
          precioVenta: opt.ApmStIncrementaPrecio === "1" ? opt.ApmInValorFijo : 0,
          cantidad: 1
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

  const handleUpdateQty = (idUnicoCart: string, delta: number) => {
    setCarrito(prev => {
      const idx = prev.findIndex(item => item.idUnicoCart === idUnicoCart);
      if (idx === -1) return prev;

      const newCart = [...prev];
      const newQty = newCart[idx].cantidad + delta;
      
      if (newQty <= 0) {
        return newCart.filter(item => item.idUnicoCart !== idUnicoCart);
      } else {
        newCart[idx].cantidad = newQty;
        return newCart;
      }
    });
  };

  const handleRemoveItem = (idUnicoCart: string) => {
    setCarrito(prev => prev.filter(item => item.idUnicoCart !== idUnicoCart));
  };

  const clearForm = () => {
    setMesa("");
    setOrdenId(null);
    setCarrito([]);
    setNumPersonas(1);
    setBusquedaProducto("");
    setVistaMovil("productos");
    
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
        OpeInNumPersonas: numPersonas,
        OpeIdStComprobante: infoPuntoVenta?.PveIdStComprobante || "28",
        nombre_terminal: terminalName,
        productos: carrito.map(item => ({
          ProIdInProducto: item.ProIdInProducto,
          precioVenta: item.precioVenta,
          cantidad: item.cantidad,
          ProIdInUnidadVenta: item.ProIdInUnidadVenta,
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
        throw new Error(resData?.mensaje || `Error del servidor (${resp.status})`);
      }

      Swal.close();

      // Preparar los detalles del pedido para el ticket PDF
      const now = new Date();
      const fecha = now.toISOString().split('T')[0];
      const hora = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const ticketOrden = {
        nro_orden: resData.body.nro_orden,
        mesa: mesa.trim(),
        mesero: mesero?.nombre || "VENDEDOR",
        numPersonas: numPersonas,
        fecha,
        hora,
        productos: carrito.map(item => ({
          cantidad: item.cantidad,
          ProStDescripcion: item.ProStDescripcion,
          precioVenta: item.precioVenta,
          total: (item.precioVenta + item.adicionales.reduce((acc, ad) => acc + ad.precioVenta, 0)) * item.cantidad,
          adicionales: item.adicionales.map(ad => ({
            ProStDescripcion: ad.ProStDescripcion
          }))
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
        title: ordenId ? "Pedido Actualizado" : "Pedido Registrado",
        text: `Mesa: ${mesa} - Orden: #${resData.body.nro_orden}`,
        showCancelButton: true,
        confirmButtonText: "Compartir Ticket",
        cancelButtonText: "Nueva Comanda",
        confirmButtonColor: "#22c55e",
        cancelButtonColor: "#64748b"
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
            <div
              className="premium-icon-box"
              style={{
                width: "32px",
                height: "32px",
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                color: "#fff",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 10px rgba(239, 68, 68, 0.15)",
              }}
            >
              <FiLayers size={16} />
            </div>
            <div>
              <span className="co-header-subtitle">
                {ordenId ? "EDICIÓN DE PEDIDO" : "Realizar pedidos"}
              </span>
              <h1 className="co-header-title">
                {ordenId ? `Orden #${ordenId}` : "PEDIDOS"}
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
            <div className="col-12 col-md-4">
              <label className="co-form-label">Digite Mesa</label>
              <div className="co-input-box">
                <FiGrid size={16} />
                <input
                  type="text"
                  value={mesa}
                  onChange={(e) => setMesa(e.target.value)}
                  onBlur={verificarMesa}
                  onKeyDown={(e) => { if (e.key === "Enter") verificarMesa(); }}
                  placeholder="Mesa o Barra..."
                />
              </div>
            </div>

            {/* Waiter / Mesero Autocomplete */}
            <div className="col-12 col-md-5">
              <label className="co-form-label">Mesero Responsable</label>
              <div className="co-input-box">
                <FiUser size={16} />
                <input
                  type="text"
                  value={meseroBusqueda}
                  onChange={(e) => handleMeseroChange(e.target.value)}
                  onFocus={() => { setShowWaitersList(true); }}
                  placeholder="Escriba nombre o cédula..."
                />
                {mesero ? (
                  <button className="co-btn-clear" onClick={limpiarMesero} title="Cambiar mesero">
                    <FiX size={14} />
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={() => { setShowWaitersList(v => !v); if(!showWaitersList) fetchWaiters(""); }}
                    style={{ border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    <FiList size={14} />
                  </button>
                )}

                {/* Suggestions Flotante */}
                {showWaitersList && waitersSuggestions.length > 0 && (
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
            <div className="col-12 col-md-3">
              <label className="co-form-label">Nro. Personas</label>
              <div className="co-people-counter-box">
                <button
                  type="button"
                  className="co-btn-counter-inc"
                  onClick={() => setNumPersonas(prev => Math.max(1, prev - 1))}
                  disabled={numPersonas <= 1}
                >
                  <FiMinus size={12} />
                </button>
                <input
                  type="number"
                  min="1"
                  value={numPersonas}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setNumPersonas(val > 0 ? val : 1);
                  }}
                  className="co-counter-val border-0 p-0"
                  style={{ outline: "none", background: "transparent" }}
                />
                <button
                  type="button"
                  className="co-btn-counter-inc"
                  onClick={() => setNumPersonas(prev => prev + 1)}
                >
                  <FiPlus size={12} />
                </button>
              </div>
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
            FACTURA {formatMoneda(total)}
          </button>
        </nav>

        {/* Panels */}
        
        {/* Panel 1: Productos */}
        <section className={`co-panel ${vistaMovil === "productos" ? "active" : ""}`}>
          <div className="co-panel-header">
            <h2>AÑADIR PRODUCTOS</h2>
            <select disabled>
              <option value="1">BODEGA PRINCIPAL</option>
            </select>
          </div>
          
          <div className="co-search-bar">
            <FiSearch size={16} />
            <input
              type="text"
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              placeholder="BUSCAR PRODUCTO O CODIGO"
            />
          </div>

          <div className="co-products-scroll">
            {cargandoProductos && productos.length === 0 ? (
              <div className="text-center py-5 text-muted">Buscando productos...</div>
            ) : productos.length === 0 ? (
              <div className="text-center py-5 text-muted">No hay productos para mostrar</div>
            ) : (
              productos.map((p) => {
                const stock = p.ExiInCantidadFinalBodega || 0;
                const qty = cantidadesRapidas[p.ProIdInProducto] || 1;
                return (
                  <article key={p.ProIdInProducto} className="co-product-row">
                    <div className="co-product-info">
                      <strong className="co-product-name">{p.ProStDescripcion}</strong>
                      <div className="co-product-meta">
                        <span className="co-meta-code">COD. {p.ProIdInProducto}</span>
                        <span className={`co-meta-stock ${stock > 0 ? "stock-ok" : "stock-low"}`}>
                          STOCK: {stock} {p.PreStAbreviatura || "UND"}
                        </span>
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
              <div className="text-center py-5 text-muted">El carrito está vacío</div>
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
                    <div className="co-cart-info">
                      {item.MopStImpreso === '1' ? (
                        <strong>
                          {item.ProStDescripcion}{" "}
                          <span className="badge bg-light text-secondary ms-1" style={{ fontSize: '0.65rem' }}>Impreso</span>
                        </strong>
                      ) : (
                        <strong style={{ color: "#000000", fontWeight: 800 }}>
                          {item.ProStDescripcion}{" "}
                          <span className="badge bg-success ms-1" style={{ fontSize: '0.65rem', background: "#22c55e", color: "#ffffff" }}>Nuevo</span>
                        </strong>
                      )}
                      <small style={item.MopStImpreso !== '1' ? { color: "#000000", fontWeight: "bold" } : {}}>
                        x{item.cantidad}
                      </small>
                    </div>
                    
                    <span className="co-cart-total">{formatMoneda(itemTotal)}</span>
                    
                    <div className="d-flex align-items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary p-0 d-flex align-items-center justify-content-center"
                        style={{ width: '22px', height: '22px', borderRadius: '4px' }}
                        onClick={() => handleUpdateQty(item.idUnicoCart, -1)}
                      >
                        <FiMinus size={10} />
                      </button>
                      <span className="fw-bold px-1" style={{ fontSize: '0.8rem' }}>{item.cantidad}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary p-0 d-flex align-items-center justify-content-center"
                        style={{ width: '22px', height: '22px', borderRadius: '4px' }}
                        onClick={() => handleUpdateQty(item.idUnicoCart, 1)}
                      >
                        <FiPlus size={10} />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="co-btn-delete"
                      onClick={() => handleRemoveItem(item.idUnicoCart)}
                      aria-label={`Eliminar ${item.ProStDescripcion}`}
                    >
                      <FiTrash2 size={13} />
                    </button>

                    {item.adicionales.length > 0 && (
                      <div className="co-cart-sides-box">
                        {item.adicionales.map((ad, sIdx) => (
                          <div key={sIdx} className="co-cart-side-tag">
                            <span>+ {ad.ProStDescripcion}</span>
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

        {/* Panel 3: Factura / Confirmar venta matching Screenshot 3 */}
        <section className={`co-panel ${vistaMovil === "factura" ? "active" : ""}`}>
          <div className="co-panel-header">
            <h2>FACTURA</h2>
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
                          {item.MopStImpreso === '1' ? (
                            <span>
                              {item.ProStDescripcion}{" "}
                              <span className="badge bg-light text-secondary ms-2" style={{ fontSize: '0.65rem' }}>Impreso</span>
                            </span>
                          ) : (
                            <strong style={{ color: "#000000", fontWeight: 800 }}>
                              {item.ProStDescripcion}{" "}
                              <span className="badge bg-success ms-2" style={{ fontSize: '0.65rem', background: "#22c55e", color: "#ffffff" }}>Nuevo</span>
                            </strong>
                          )}
                          {item.adicionales.length > 0 && (
                            <div className="co-bill-sides-list">
                              {item.adicionales.map((ad, sIdx) => (
                                <span key={sIdx} className="co-bill-side-item">
                                  + {ad.ProStDescripcion} {ad.precioVenta > 0 ? `(${formatMoneda(ad.precioVenta)})` : ""}
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
              >
                CONFIRMAR VENTA
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
            
            return (
              <div key={group.CprIdInAdicionales} className="mb-4">
                <div className="accompaniment-group-title d-flex justify-content-between">
                  <span>{group.AprStDescripcion}</span>
                  <Badge bg={group.CprInCantidad === 0 ? "secondary" : "danger"} className="rounded-pill">
                    {group.CprInCantidad === 0 ? "Opcional" : `Elige hasta ${group.CprInCantidad}`}
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

                    const isSelected = currentSelected.some(s => s.ApmIdInProducto === opt.ApmIdInProducto);
                    
                    return (
                      <div
                        key={opt.ApmIdInProducto}
                        className={`accompaniment-option-item ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleSideSelection(group, opt)}
                      >
                        <div className="d-flex align-items-center gap-2">
                          {isSelected && <FiCheck className="text-danger fw-bold" size={16} />}
                          <span className="accompaniment-option-text">
                            {opt.ProStDescripcion}
                          </span>
                        </div>
                        {opt.ApmInValorFijo > 0 && (
                          <span className="accompaniment-option-price">
                            +{formatMoneda(opt.ApmInValorFijo)}
                          </span>
                        )}
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
