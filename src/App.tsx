import { useState, useEffect } from "react";
import "./styles/App.css";
import Login from "./pages/Login";
import Sidebar from "./components/layout/Sidebar";
import CrearOrdenes from "./pages/CrearOrdenes";
import OrdenesOpen from "./pages/OrdenesOpen";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { FiHome } from "react-icons/fi";
import type { MenuKey } from "./components/layout/Sidebar";

export default function App() {
  const [logueado, setLogueado] = useState(() => {
    const token = localStorage.getItem("token");
    const lastLogin = localStorage.getItem("last_login");
    /**Validar sesión y si el tiempo ha expirado */
    if (token && lastLogin) {
      const dosHoras = 2 * 60 * 60 * 1000;
      if (Date.now() - Number(lastLogin) > dosHoras) {
        localStorage.removeItem("token");
        localStorage.removeItem("last_login");
        return false;
      }
      return true;
    }
    return Boolean(token);
  });

  const [menuActivo, setMenuActivo] = useState<MenuKey>("home");
  const [ordenIdEdicion, setOrdenIdEdicion] = useState<number | null>(null);

  useEffect(() => {
    if (!logueado) return;

    // Registrar actividad del usuario para prolongar la sesión si está interactuando
    let ultimoGuardado = Date.now();
    const registrarActividad = () => {
      const ahora = Date.now();
      if (ahora - ultimoGuardado > 30000) { // Actualizar last_login como máximo cada 30 segundos
        localStorage.setItem("last_login", ahora.toString());
        ultimoGuardado = ahora;
      }
    };

    const revisarSesion = () => {
      const lastLogin = localStorage.getItem("last_login");
      if (lastLogin) {
        const dosHoras = 2 * 60 * 60 * 1000;
        if (Date.now() - Number(lastLogin) > dosHoras) {
          localStorage.removeItem("token");
          localStorage.removeItem("last_login");
          setLogueado(false);
        }
      }
    };

    // Prolongar sesión automáticamente si la pestaña está visible
    const intervaloVisible = setInterval(() => {
      if (document.visibilityState === "visible") {
        localStorage.setItem("last_login", Date.now().toString());
      }
    }, 300000); // Cada 5 minutos

    const eventos = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];
    eventos.forEach((ev) => window.addEventListener(ev, registrarActividad));

    // Revisar cada minuto y al volver a la pestaña
    const intervaloRevisar = setInterval(revisarSesion, 60000);
    window.addEventListener("focus", revisarSesion);

    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, registrarActividad));
      clearInterval(intervaloVisible);
      clearInterval(intervaloRevisar);
      window.removeEventListener("focus", revisarSesion);
    };
  }, [logueado]);

  if (!logueado) {
    return <Login onLogin={() => setLogueado(true)} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        activo={menuActivo}
        onCambiar={setMenuActivo}
        onSalir={() => {
          localStorage.removeItem("token");
          localStorage.removeItem("last_login");
          setMenuActivo("home");
          setLogueado(false);
        }}
      />

      <section className="app-content">
        {menuActivo === "home" ? (
          <section
            className="premium-home-panel px-3 pt-0"
            aria-label="Pantalla de inicio"
            style={{ background: "#f8fafc", minHeight: "100vh", paddingBottom: "60px" }}
          >
            <div className="container-fluid">
              {/* Header Premium Simplificado */}
              <header
                className="bg-white p-2 px-4 mb-4 rounded-4 shadow-premium d-flex justify-content-between align-items-center flex-wrap gap-2"
                style={{ minHeight: "70px" }}
              >
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="premium-icon-box"
                    style={{
                      width: "34px",
                      height: "34px",
                      background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                      color: "#fff",
                      borderRadius: "10px",
                      display : "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 10px rgba(239, 68, 68, 0.15)",
                    }}
                  >
                    <FiHome size={18} />
                  </div>
                  <div className="d-flex flex-column">
                    <span className="text-muted fw-bold text-uppercase mb-0" style={{ fontSize: "0.65rem", letterSpacing: "0.1em" }}>
                      Comanda
                    </span>
                    <h1 className="m-0 text-uppercase" style={{ fontSize: "1.35rem", color: "#334155", fontWeight: 600, letterSpacing: "0.02em" }}>
                      Inicio
                    </h1>
                  </div>
                </div>
              </header>

              {/* Contenido en Blanco con Tarjeta de Bienvenida Minimalista */}
              <main className="row justify-content-center pt-5">
                <div className="col-12 col-md-8 col-lg-6">
                  <div className="bg-white p-5 rounded-4 shadow-premium text-center border-0">
                    <div
                      className="d-inline-flex align-items-center justify-content-center mb-4"
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "50%",
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "#ef4444"
                      }}
                    >
                      <FiHome size={36} />
                    </div>
                    <h2 className="fw-bold mb-3" style={{ color: "#1e293b", fontSize: "1.75rem" }}>
                      ¡Bienvenido al Panel de Comandas!
                    </h2>
                    <p className="text-muted mx-auto" style={{ maxWidth: "420px", fontSize: "0.95rem", lineHeight: "1.6" }}>
                      Has iniciado sesión correctamente en el sistema de comandas. En próximas actualizaciones se añadirán los módulos de gestión.
                    </p>
                  </div>
                </div>
              </main>
            </div>
          </section>
        ) : menuActivo === "comanda" ? (
          <CrearOrdenes initialOrdenId={ordenIdEdicion} onClearInitial={() => setOrdenIdEdicion(null)} />
        ) : menuActivo === "ordenes" ? (
          ordenIdEdicion !== null ? (
            <CrearOrdenes initialOrdenId={ordenIdEdicion} onClearInitial={() => setOrdenIdEdicion(null)} />
          ) : (
            <OrdenesOpen onEditar={(id) => setOrdenIdEdicion(id)} />
          )
        ) : null}
      </section>
    </div>
  );
}

