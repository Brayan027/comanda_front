import { useState, useEffect, useRef } from "react";
import "./styles/App.css";
import Login from "./pages/Login";
import Sidebar from "./components/layout/Sidebar";
import CrearOrdenes from "./pages/CrearOrdenes";
import OrdenesOpen from "./pages/OrdenesOpen";
import PedidosPendientes from "./pages/PedidosPendientes";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { FiHome, FiPlus, FiLayers, FiChevronRight, FiClock } from "react-icons/fi";
import Swal from "sweetalert2";
import type { MenuKey } from "./components/layout/Sidebar";
import { API_BASE_URL, socket, getTerminalId, isMobileOrTabletDevice, isMandatoryPrintEnabled, apiFetch } from "./config/api";
import { playNewOrderSound } from "./utils/audioAlert";
import { storage } from "./utils/storage";

export default function App() {
  const [logueado, setLogueado] = useState(() => {
    const token = storage.getItem("token");
    return Boolean(token);
  });

  const [menuActivo, setMenuActivo] = useState<MenuKey>("home");
  const [ordenIdEdicion, setOrdenIdEdicion] = useState<string | number | null>(null);
  const [comandaResetKey, setComandaResetKey] = useState(0);
  const [fechaTrabajoRaw, setFechaTrabajoRaw] = useState<string | null>(null);
  const [cantPendientes, setCantPendientes] = useState(0);
  const [esMovilOTablet, setEsMovilOTablet] = useState(() => isMobileOrTabletDevice());
  const [esObligatorioState, setEsObligatorioState] = useState(() => isMandatoryPrintEnabled());

  useEffect(() => {
    const handleResize = () => setEsMovilOTablet(isMobileOrTabletDevice());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Redirección de seguridad: Si la pestaña activa es 'pendientes' pero estamos en móvil o la impresión es obligatoria, cambiar a 'ordenes'
  useEffect(() => {
    if ((esObligatorioState || esMovilOTablet) && menuActivo === "pendientes") {
      setMenuActivo("ordenes");
    }
  }, [esMovilOTablet, menuActivo, esObligatorioState]);




  // Alarma sonora continua mientras existan pedidos sin procesar (SOLO en PC y cuando NO es obligatorio imprimir)
  useEffect(() => {
    if (!logueado || cantPendientes <= 0 || esMovilOTablet || isMandatoryPrintEnabled()) return;

    const soundOn = storage.getItem("sonidoPendientesHabilitado") !== "false";
    if (soundOn) {
      playNewOrderSound();
    }

    const intervalId = setInterval(() => {
      const soundActive = storage.getItem("sonidoPendientesHabilitado") !== "false";
      if (soundActive) {
        playNewOrderSound();
      }
    }, 3500);

    return () => clearInterval(intervalId);
  }, [logueado, cantPendientes, esMovilOTablet]);

  const navCheckRef = useRef<((() => Promise<boolean>)) | null>(null);


  const solicitarConfirmacionNavegacion = async (): Promise<boolean> => {
    if (navCheckRef.current) {
      return await navCheckRef.current();
    }
    return true;
  };

  const unlockCurrentOrder = async (id: string | number | null) => {
    if (!id) return;
    try {
      const token = storage.getItem("token") || "";
      const info = JSON.parse(storage.getItem("infoPuntoVenta") || "{}");
      await apiFetch(`${API_BASE_URL}/ordenes/mesa/cerrar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "empresa": info?.PveIdStEmpresa || "02",
          "punto": String(info?.PveIdInPuntoVenta || "5")
        },
        body: JSON.stringify({ mesa: id })
      });
    } catch (e) {
      console.error("Error al liberar mesa:", e);
    }
  };

  const handleNavCrearOrdenes = async () => {
    const puedeNavegar = await solicitarConfirmacionNavegacion();
    if (!puedeNavegar) return;

    if (ordenIdEdicion) {
      unlockCurrentOrder(ordenIdEdicion);
    }
    setOrdenIdEdicion(null);
    setMenuActivo("comanda");
    setComandaResetKey(prev => prev + 1);
  };

  const infoPuntoVenta = (() => {
    try {
      const stored = storage.getItem("infoPuntoVenta");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!logueado) {
      setFechaTrabajoRaw(null);
      return;
    }

    const token = storage.getItem("token") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };

    const storedInfo = storage.getItem("infoPuntoVenta");
    if (storedInfo) {
      try {
        const info = JSON.parse(storedInfo);
        if (info) {
          headers["empresa"] = info.PveIdStEmpresa || "";
          headers["punto"] = String(info.PveIdInPuntoVenta || "");
        }
      } catch (e) {
        console.error(e);
      }
    }

    const terminalName = getTerminalId();
    headers["terminal"] = terminalName;

    apiFetch(`${API_BASE_URL}/ordenes/mesa/cerrar-terminal`, {
      method: "POST",
      headers,
      body: JSON.stringify({ terminal: terminalName })
    }).catch(err => console.error("Error al limpiar mesas de terminal:", err));

    const fetchConfigApp = () => {
      apiFetch(`${API_BASE_URL}/ordenes/config-app`, { headers })
        .then(res => res.json())
        .then(data => {
          if (data && data.body) {
            if (data.body.obligatorioImprimir) {
              storage.setItem("obligatorioImprimir", String(data.body.obligatorioImprimir));
              setEsObligatorioState(isMandatoryPrintEnabled());
            }
            if (data.body.tipoSonidoPendientes) {
              storage.setItem("config_tipoSonidoPendientes", String(data.body.tipoSonidoPendientes));
            }
            if (data.body.inactividadHoras !== undefined) {
              const val = Number(data.body.inactividadHoras);
              if (isNaN(val) || val < 0.05) {
                storage.setItem("config_inactividadHoras", "0");
              } else {
                storage.setItem("config_inactividadHoras", String(val));
              }
            }
          }
        })
        .catch(err => console.error("Error al obtener config-app:", err));
    };

    fetchConfigApp();

    const fetchFechaTrabajo = () => {

      apiFetch(`${API_BASE_URL}/ordenes/fecha-trabajo`, { headers })
        .then(res => res.json())
        .then(data => {
          if (data && data.body) {
            if (data.body.fecha) {
              setFechaTrabajoRaw(data.body.fecha);
              try {
                const stored = storage.getItem("infoPuntoVenta");
                if (stored) {
                  const info = JSON.parse(stored);
                  if (info.PveDtFechaTrabajo !== data.body.fecha) {
                    info.PveDtFechaTrabajo = data.body.fecha;
                    storage.setItem("infoPuntoVenta", JSON.stringify(info));
                  }
                }
              } catch (e) {
                console.error(e);
              }
            }
            if (data.body.bloqueada !== undefined) {
              storage.setItem("comanderaBloqueada", String(data.body.bloqueada));
            } else {
              storage.removeItem("comanderaBloqueada");
            }
            if (data.body.obligatorioImprimir !== undefined) {
              storage.setItem("obligatorioImprimir", String(data.body.obligatorioImprimir));
              setEsObligatorioState(isMandatoryPrintEnabled());
            }

          }
        })
        .catch(err => {
          console.error("Error al obtener la fecha de trabajo:", err);
        });
    };

    const fetchPendientesCount = () => {
      apiFetch(`${API_BASE_URL}/ordenes/pendientes`, { headers })
        .then(res => res.json())
        .then(data => {
          if (data && data.body) {
            const count = Array.isArray(data.body) 
              ? data.body.filter((p: any) => (p.totalSinImprimir || 0) > 0).length 
              : 0;
            setCantPendientes(prev => {
              if (count > prev && prev > 0) {
                const esPcYPendientesHabilitado = !isMobileOrTabletDevice() && !isMandatoryPrintEnabled();

                if (esPcYPendientesHabilitado) {
                  const soundOn = storage.getItem("sonidoPendientesHabilitado") !== "false";
                  if (soundOn) {
                    playNewOrderSound();
                  }

                  Swal.fire({
                    icon: "info",
                    title: "¡Nuevo pedido recibido!",
                    text: `Tienes ${count} comanda${count > 1 ? "s" : ""} pendiente${count > 1 ? "s" : ""} por confirmar.`,
                    toast: true,
                    position: "top-end",
                    showConfirmButton: false,
                    timer: 3500,
                    timerProgressBar: true
                  });
                }
              }
              return count;
            });
          }
        })
        .catch(err => console.error("Error al consultar conteo de pendientes:", err));
    };

    fetchFechaTrabajo();
    fetchPendientesCount();

    // Polling cada 4 segundos para actualizar el contador de pendientes cuando Dianasis Desktop factura un pedido
    const pollingInterval = setInterval(() => {
      fetchPendientesCount();
    }, 4000);

    // Listener de socket para recibir actualización de fecha de trabajo en tiempo real
    const handleFechaTrabajoActualizada = (data: { fecha?: string; bloqueada?: boolean; obligatorioImprimir?: boolean }) => {
      if (data?.fecha) {
        setFechaTrabajoRaw(data.fecha);
        try {
          const stored = storage.getItem("infoPuntoVenta");
          if (stored) {
            const info = JSON.parse(stored);
            info.PveDtFechaTrabajo = data.fecha;
            storage.setItem("infoPuntoVenta", JSON.stringify(info));
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (data?.bloqueada !== undefined) {
        storage.setItem("comanderaBloqueada", String(data.bloqueada));
      } else {
        storage.removeItem("comanderaBloqueada");
      }
      if (data?.obligatorioImprimir !== undefined) {
        storage.setItem("obligatorioImprimir", String(data.obligatorioImprimir));
        setEsObligatorioState(isMandatoryPrintEnabled());
      }
    };


    const handleOrdenesActualizadas = () => {
      fetchFechaTrabajo();
      fetchPendientesCount();
    };

    socket.on("fecha_trabajo_actualizada", handleFechaTrabajoActualizada);
    socket.on("ordenes_actualizadas", handleOrdenesActualizadas);
    socket.on("nuevo_pedido_pendiente", handleOrdenesActualizadas);

    // Solicitar fecha de trabajo mediante Socket al conectar
    socket.emit("obtener_fecha_trabajo", {
      empresa: headers["empresa"] || "02",
      punto: headers["punto"] || "5"
    });

    const handleSendBeaconGlobal = () => {
      const term = storage.getItem("terminal") || "TERMINAL 1";
      let info: any = {};
      try {
        info = JSON.parse(storage.getItem("infoPuntoVenta") || "{}");
      } catch (e) {}

      const payload = JSON.stringify({
        terminal: term,
        empresa: info?.PveIdStEmpresa || "02",
        punto: String(info?.PveIdInPuntoVenta || "5")
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(`${API_BASE_URL}/ordenes/mesa/cerrar-beacon`, blob);
      }
    };

    window.addEventListener("pagehide", handleSendBeaconGlobal);
    window.addEventListener("beforeunload", handleSendBeaconGlobal);

    return () => {
      clearInterval(pollingInterval);
      socket.off("fecha_trabajo_actualizada", handleFechaTrabajoActualizada);
      socket.off("ordenes_actualizadas", handleOrdenesActualizadas);
      window.removeEventListener("pagehide", handleSendBeaconGlobal);
      window.removeEventListener("beforeunload", handleSendBeaconGlobal);
    };
  }, [logueado]);

  const getFechaActual = (rawDate: string | null) => {
    let dateStr = rawDate;
    if (!dateStr) {
      const stored = storage.getItem("infoPuntoVenta");
      if (stored) {
        try {
          const info = JSON.parse(stored);
          if (info && info.PveDtFechaTrabajo) {
            dateStr = info.PveDtFechaTrabajo;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (!dateStr) {
      const now = new Date();
      const f = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return f.charAt(0).toUpperCase() + f.slice(1);
    }

    const cleanDate = String(dateStr).split("T")[0].split(" ")[0];
    const parts = cleanDate.split("-");

    if (parts.length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1])) && !isNaN(Number(parts[2]))) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const baseDate = new Date(Date.UTC(year, month, day));
      const f = baseDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      return f.charAt(0).toUpperCase() + f.slice(1);
    }

    const fallbackDate = new Date(dateStr);
    if (!isNaN(fallbackDate.getTime())) {
      const f = fallbackDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return f.charAt(0).toUpperCase() + f.slice(1);
    }

    const now = new Date();
    const f = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return f.charAt(0).toUpperCase() + f.slice(1);
  };

  const fechaActual = getFechaActual(fechaTrabajoRaw);

  useEffect(() => {
    if (!logueado) return;

    // Listener para eventos de sesión expirada por API (HTTP 401)
    const handleSessionExpired = () => {
      storage.removeItem("token");
      storage.removeItem("last_login");
      storage.removeItem("last_activity_time");
      Swal.close();
      setLogueado(false);
      Swal.fire({
        icon: "info",
        title: "Sesión Expirada",
        text: "Su sesión ha finalizado. Por favor inicie sesión nuevamente.",
        confirmButtonText: "Aceptar",
        confirmButtonColor: "#2563eb"
      });
    };

    window.addEventListener("session_expired", handleSessionExpired);

    // CONTROL DE INACTIVIDAD CONFIGURABLE ÚNICAMENTE DESDE EL .env DEL BACKEND (INACTIVIDAD_HORAS):
    // Cualquier interacción (clic, toque, scroll, teclado, mover mouse) reinicia el tiempo a cero.
    // Si en el backend se configura INACTIVIDAD_HORAS=0 (o valores < 0.05), la inactividad queda DESACTIVADA por completo.
    const getTimeoutHours = (): number => {
      const backendVal = storage.getItem("config_inactividadHoras");
      if (backendVal !== null && backendVal !== "") {
        const val = Number(backendVal);
        if (isNaN(val) || val < 0.05) return 0;
        return val;
      }
      return 0;
    };

    const verificarInactividad = (): boolean => {
      const timeoutHours = getTimeoutHours();
      if (timeoutHours <= 0) return false;

      const INACTIVIDAD_MS = timeoutHours * 60 * 60 * 1000;
      const stored = storage.getItem("last_activity_time");
      const lastTime = stored ? parseInt(stored, 10) : Date.now();
      const ahora = Date.now();

      if (ahora - lastTime >= INACTIVIDAD_MS) {
        storage.removeItem("token");
        storage.removeItem("last_login");
        storage.removeItem("last_activity_time");
        Swal.close();
        setLogueado(false);
        const tiempoTexto = timeoutHours < 1 
          ? `${Math.round(timeoutHours * 60)} minutos` 
          : `${timeoutHours} ${timeoutHours === 1 ? 'hora' : 'horas'}`;

        Swal.fire({
          icon: "warning",
          title: "Sesión Cerrada por Inactividad",
          text: `Ha transcurrido más de ${tiempoTexto} sin actividad en la aplicación. Su sesión ha sido cerrada por seguridad.`,
          confirmButtonText: "Aceptar",
          confirmButtonColor: "#2563eb"
        });
        return true;
      }
      return false;
    };

    // Si al montar o volver ya transcurrieron las horas de inactividad
    if (verificarInactividad()) {
      return () => window.removeEventListener("session_expired", handleSessionExpired);
    }

    let ultimoGuardado = Date.now();
    storage.setItem("last_activity_time", ultimoGuardado.toString());

    // Cada interacción del usuario actualiza la fecha/hora de última actividad (reiniciando el contador de 8 horas)
    const registrarActividad = () => {
      const ahora = Date.now();
      if (verificarInactividad()) return;

      // Throttle para evitar escrituras excesivas en localStorage (guardar máximo cada 3 segundos)
      if (ahora - ultimoGuardado > 3000) {
        storage.setItem("last_activity_time", ahora.toString());
        storage.setItem("last_login", ahora.toString());
        ultimoGuardado = ahora;
      }
    };

    const eventos = ["mousedown", "mousemove", "keypress", "keydown", "scroll", "touchstart", "click"];
    eventos.forEach((ev) => window.addEventListener(ev, registrarActividad, { passive: true }));

    // Verificación periódica cada 30 segundos y al reactivar la pestaña/pantalla
    const checkInterval = setInterval(() => {
      verificarInactividad();
    }, 30000);

    const handleFocusOrVisibility = () => {
      verificarInactividad();
    };

    window.addEventListener("focus", handleFocusOrVisibility);
    document.addEventListener("visibilitychange", handleFocusOrVisibility);

    return () => {
      window.removeEventListener("session_expired", handleSessionExpired);
      eventos.forEach((ev) => window.removeEventListener(ev, registrarActividad));
      clearInterval(checkInterval);
      window.removeEventListener("focus", handleFocusOrVisibility);
      document.removeEventListener("visibilitychange", handleFocusOrVisibility);
    };
  }, [logueado]);

  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} />;
  }

  const vendedorInfo = (() => {
    const parseCleanName = (val: any): string => {
      if (!val) return "";
      if (typeof val === "object") {
        return (
          val.CliStNombreCliente ||
          val.CliNombreCliente ||
          val.VenStNombre ||
          val.nombre ||
          val.UsuStNombre ||
          val.VenStDescripcion ||
          val.nombreVendedor ||
          val.nombre_vendedor ||
          val.name ||
          ""
        );
      }
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const parsed = JSON.parse(trimmed);
            return parseCleanName(parsed);
          } catch {
            // ignore
          }
        }
        if (trimmed.toUpperCase() !== "VENDEDOR") {
          return trimmed;
        }
      }
      return "";
    };

    try {
      const keys = ["vendedor", "infoPuntoVenta", "usuarioLogueado", "usuario", "user", "nombreUsuario", "lastUser"];
      for (const k of keys) {
        const item = storage.getItem(k);
        if (item) {
          const name = parseCleanName(item);
          if (name) return name;
        }
      }
    } catch (e) {
      console.error(e);
    }

    return "ADMINISTRADOR";
  })();

  const getInitials = (name: string) => {
    if (!name) return "VD";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="app-container">
      <Sidebar
        activo={menuActivo}
        esObligatorioImprimir={esObligatorioState}
        onCambiar={async (menu) => {
          if (menu === "comanda") {
            handleNavCrearOrdenes();
          } else {
            const puedeNavegar = await solicitarConfirmacionNavegacion();
            if (!puedeNavegar) return;

            if (ordenIdEdicion) {
              unlockCurrentOrder(ordenIdEdicion);
            }
            setOrdenIdEdicion(null);
            setMenuActivo(menu);
          }
        }}
        onSalir={async () => {
          const puedeSalir = await solicitarConfirmacionNavegacion();
          if (!puedeSalir) return;

          storage.removeItem("token");
          storage.removeItem("last_login");
          setMenuActivo("home");
          setLogueado(false);
        }}
        empresaNombre={infoPuntoVenta?.gmpnomb || infoPuntoVenta?.PveStNombreEmpresa}
        puntoNombre={infoPuntoVenta?.PveStNombre}
        fechaActual={fechaActual}
        terminal={storage.getItem("terminal") || "Terminal Desconocida"}
        cantPendientes={cantPendientes}
      />

      <section className="app-content">
        {menuActivo === "home" ? (
          <section
            className="premium-home-panel px-1 px-md-3 pt-0"
            aria-label="Pantalla de inicio"
            style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px" }}
          >
            <div className="container-fluid pt-2 px-1 px-md-2">
              {/* Header Premium y Panel Unificados en un Solo Card Blanco Sin Cortes */}
              <div className="co-unified-main-card">
                <header className="co-header d-flex align-items-center justify-content-between">
                  {/* Lado izquierdo: Icono Red Home y Título separados */}
                  <div className="d-flex align-items-center gap-3 flex-shrink-0" style={{ gap: "12px" }}>
                    {/* Icono Red Home Solido */}
                    <div
                      className="premium-icon-box flex-shrink-0"
                      style={{
                        width: "28px",
                        height: "28px",
                        background: "#e31b23",
                        color: "#ffffff",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(227, 27, 35, 0.2)"
                      }}
                    >
                      <FiHome size={14} />
                    </div>

                    {/* Título de la sección */}
                    <div className="d-flex flex-column ms-1">
                      <span className="text-uppercase fw-bold mb-0" style={{ fontSize: "0.6rem", letterSpacing: "0.08em", color: "#64748b" }}>
                        Comanda
                      </span>
                      <h1 className="m-0 text-uppercase fw-bold" style={{ fontSize: "1.05rem", color: "#1e293b", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                        Inicio
                      </h1>
                    </div>
                  </div>

                  {/* Lado derecho: Nombre de Usuario Limpio sin tarjeta ni etiqueta VENDEDOR */}
                  <div className="d-flex align-items-center gap-2 ms-auto overflow-hidden flex-shrink-0" style={{ maxWidth: "60%" }}>
                    <span 
                      className="fw-bold text-uppercase text-dark text-truncate" 
                      style={{ fontSize: "0.78rem", letterSpacing: "0.01em", maxWidth: "160px" }}
                      title={vendedorInfo}
                    >
                      {vendedorInfo}
                    </span>
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
                      style={{
                        width: "28px",
                        height: "28px",
                        background: "#e31b23",
                        fontSize: "0.72rem",
                        boxShadow: "0 2px 4px rgba(227, 27, 35, 0.25)"
                      }}
                    >
                      {getInitials(vendedorInfo)}
                    </div>
                  </div>
                </header>

                <main className="co-panel-body p-0 p-md-3 w-100">
                <div className="row g-3 m-0 w-100 align-items-stretch">
                  {/* Tarjeta 1: Nuevo Pedido */}
                  <div className="col-12 col-md-6 p-0 pe-md-2 mb-2">
                    <div
                      className="bg-white py-2.5 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer w-100 h-100"
                      style={{ 
                        cursor: "pointer", 
                        borderColor: "#e2e8f0",
                        transition: "all 0.15s ease-in-out",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02)",
                        paddingLeft: "12px",
                        paddingRight: "12px",
                        minHeight: "76px"
                      }}
                      onClick={handleNavCrearOrdenes}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#cbd5e1";
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.02)";
                      }}
                    >
                      <div className="d-flex align-items-center" style={{ gap: "14px" }}>
                        <div
                          className="d-flex align-items-center justify-content-center"
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "#fee2e2",
                            color: "#e31b23",
                            flexShrink: 0
                          }}
                        >
                          <FiPlus size={18} />
                        </div>
                        <div className="d-flex flex-column text-start">
                          <h3 className="m-0 fw-bold" style={{ fontSize: "0.92rem", color: "#1e293b" }}>
                            Nuevo Pedido
                          </h3>
                          <p className="m-0 text-muted" style={{ fontSize: "0.74rem", marginTop: "1px" }}>
                            Crear y registrar un nuevo pedido para un cliente.
                          </p>
                        </div>
                      </div>
                      <div className="text-muted ps-2 flex-shrink-0">
                        <FiChevronRight size={18} />
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta 2: Órdenes Abiertas (Si es OBLIGATORIO_IMPRIMIR="SI" o si es Móvil/Tablet) */}
                  {(isMandatoryPrintEnabled() || esMovilOTablet) && (
                    <div className="col-12 col-md-6 p-0 ps-md-2 mb-2">
                      <div
                        className="bg-white py-2.5 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer w-100 h-100"
                        style={{ 
                          cursor: "pointer", 
                          borderColor: "#e2e8f0",
                          transition: "all 0.15s ease-in-out",
                          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02)",
                          paddingLeft: "12px",
                          paddingRight: "12px",
                          minHeight: "76px"
                        }}
                        onClick={async () => {
                          const puedeNavegar = await solicitarConfirmacionNavegacion();
                          if (puedeNavegar) setMenuActivo("ordenes");
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#cbd5e1";
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#e2e8f0";
                          e.currentTarget.style.transform = "none";
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.02)";
                        }}
                      >
                        <div className="d-flex align-items-center" style={{ gap: "14px" }}>
                          <div
                            className="d-flex align-items-center justify-content-center"
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "8px",
                              background: "#fef3c7",
                              color: "#d97706",
                              flexShrink: 0
                            }}
                          >
                            <FiLayers size={18} />
                          </div>
                          <div className="d-flex flex-column text-start">
                            <h3 className="m-0 fw-bold" style={{ fontSize: "0.92rem", color: "#1e293b" }}>
                              Órdenes Abiertas
                            </h3>
                            <p className="m-0 text-muted" style={{ fontSize: "0.74rem", marginTop: "1px" }}>
                              Visualizar, editar y gestionar pedidos en proceso.
                            </p>
                          </div>
                        </div>
                        <div className="text-muted ps-2 flex-shrink-0">
                          <FiChevronRight size={18} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tarjeta 2: Pedidos Pendientes (Solo en PC cuando OBLIGATORIO_IMPRIMIR="NO") */}
                  {(!isMandatoryPrintEnabled() && !esMovilOTablet) && (
                    <div className="col-12 col-md-6 p-0 ps-md-2 mb-2">
                      <div
                        className="bg-white py-2.5 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer w-100 h-100 position-relative"
                        style={{ 
                          cursor: "pointer", 
                          borderColor: cantPendientes > 0 ? "#fca5a5" : "#e2e8f0",
                          background: cantPendientes > 0 ? "#fffdf5" : "#ffffff",
                          transition: "all 0.15s ease-in-out",
                          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.02)",
                          paddingLeft: "12px",
                          paddingRight: "12px",
                          minHeight: "76px"
                        }}
                        onClick={async () => {
                          const puedeNavegar = await solicitarConfirmacionNavegacion();
                          if (puedeNavegar) setMenuActivo("pendientes");
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#cbd5e1";
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = cantPendientes > 0 ? "#fca5a5" : "#e2e8f0";
                          e.currentTarget.style.transform = "none";
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.02)";
                        }}
                      >
                        <div className="d-flex align-items-center" style={{ gap: "14px" }}>
                          <div
                            className="d-flex align-items-center justify-content-center"
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "8px",
                              background: "#d1fae5",
                              color: "#059669",
                              flexShrink: 0
                            }}
                          >
                            <FiClock size={18} />
                          </div>
                          <div className="d-flex flex-column text-start">
                            <div className="d-flex align-items-center gap-2">
                              <h3 className="m-0 fw-bold" style={{ fontSize: "0.92rem", color: "#1e293b" }}>
                                Pedidos Pendientes
                              </h3>
                              {cantPendientes > 0 && (
                                <span className="badge rounded-pill bg-danger text-white px-2 py-0.5 fw-bold badge-latido" style={{ fontSize: "0.7rem" }}>
                                  {cantPendientes}
                                </span>
                              )}
                            </div>
                            <p className="m-0 text-muted" style={{ fontSize: "0.74rem", marginTop: "1px" }}>
                              Comandas recibidas sin confirmar.
                            </p>
                          </div>
                        </div>
                        <div className="text-muted ps-2 flex-shrink-0">
                          <FiChevronRight size={18} />
                        </div>
                      </div>
                    </div>
                  )}


                </div>
              </main>
            </div>
            </div>
          </section>
        ) : menuActivo === "comanda" ? (
          <CrearOrdenes 
            key={`comanda-reset-${comandaResetKey}-${ordenIdEdicion || 'new'}`}
            initialOrdenId={ordenIdEdicion} 
            onClearInitial={() => {
              setOrdenIdEdicion(null);
              setMenuActivo("home");
            }} 
            onRegisterNavigationCheck={(fn) => { navCheckRef.current = fn; }}
          />
        ) : menuActivo === "ordenes" ? (
          ordenIdEdicion !== null ? (
            <CrearOrdenes 
              key={`ordenes-edit-${ordenIdEdicion}`}
              initialOrdenId={ordenIdEdicion} 
              onClearInitial={() => {
                setOrdenIdEdicion(null);
                setMenuActivo("ordenes");
              }} 
              onRegisterNavigationCheck={(fn) => { navCheckRef.current = fn; }}
            />
          ) : (
            <OrdenesOpen 
              onEditar={(id) => {
                setOrdenIdEdicion(id);
                setMenuActivo("ordenes");
              }} 
              onVolver={() => setMenuActivo("home")}
            />
          )
        ) : menuActivo === "pendientes" ? (
          <PedidosPendientes 
            onEditarMesa={(id) => {
              setOrdenIdEdicion(id);
              setMenuActivo("ordenes");
            }}
            onVolver={() => setMenuActivo("home")}
            onUpdateCantPendientes={(cant) => setCantPendientes(cant)}
          />
        ) : null}
      </section>
    </div>
  );
}

