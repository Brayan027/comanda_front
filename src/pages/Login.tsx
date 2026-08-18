import { useState, useEffect, type FormEvent } from "react";
import { API_BASE_URL, LOGIN_URL, sanitizarError, apiFetch } from "../config/api";
import { storage } from "../utils/storage";
import { FaUser, FaLock, FaEye, FaEyeSlash, FaDesktop, FaMapMarkerAlt } from "react-icons/fa";
import logo from "../assets/log1.png";
import "../styles/Login.css";


type LoginProps = {
  onLogin: () => void;
};

type RespuestaLogin = {
  error?: boolean;
  body?: {
    message?: string;
    mensaje?: string;
    token?: string;
    access_token?: string;
    jwt?: string;
    vendedor?: any;
    infoPuntoVenta?: any;
    usuario?: any;
  };
  message?: string;
  mensaje?: string;
  token?: string;
  access_token?: string;
  jwt?: string;
};

function intentarParsearJson(texto: string): RespuestaLogin | null {
  if (!texto.trim()) {
    return null;
  }

  try {
    return JSON.parse(texto) as RespuestaLogin;
  } catch {
    return null;
  }
}

function extraerMensajeError(data: RespuestaLogin | null, textoPlano: string): string {
  return (
    data?.body?.message
    || data?.message
    || data?.body?.mensaje
    || data?.mensaje
    || (textoPlano && !/<(!DOCTYPE|html)/i.test(textoPlano) ? textoPlano : "")
  );
}

function extraerToken(data: RespuestaLogin | null): string {
  return (
    data?.body?.token
    || data?.token
    || data?.body?.access_token
    || data?.access_token
    || data?.body?.jwt
    || data?.jwt
    || ""
  );
}
export default function Login({ onLogin }: LoginProps) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [verClave, setVerClave] = useState(false);

  const [nombreTerminal, setNombreTerminal] = useState(() => storage.getItem("terminal") || "");
  const [tieneTerminalGuardada] = useState(() => Boolean(storage.getItem("terminal")?.trim()));

  const [puntosVentaList, setPuntosVentaList] = useState<any[]>([]);
  const [puntoVentaSeleccionado, setPuntoVentaSeleccionado] = useState(() => storage.getItem("puntoVenta") || "");
  const [permiteSeleccionarPunto, setPermiteSeleccionarPunto] = useState<boolean>(() => {
    const s = storage.getItem("permiteSeleccionarPuntoVenta");
    if (s !== null) {
      return s === "SI" || s === "true" || s === "1";
    }
    return false; // Por seguridad inicia oculto hasta que el backend confirme
  });

  useEffect(() => {
    apiFetch(`${API_BASE_URL}/ordenes/config-app`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.body) {
          const permite = data.body.permiteSeleccionarPuntoVenta === "SI" || data.body.permiteSeleccionarPuntoVenta === true;
          storage.setItem("permiteSeleccionarPuntoVenta", permite ? "SI" : "NO");
          setPermiteSeleccionarPunto(permite);

          if (permite) {
            // Solo consultar lista de puntos si está permitido
            apiFetch(`${API_BASE_URL}/login/puntos-ventas`)
              .then((r) => r.json())
              .then((pvData) => {
                if (pvData && pvData.body && Array.isArray(pvData.body)) {
                  setPuntosVentaList(pvData.body);
                  if (pvData.body.length > 0 && !storage.getItem("puntoVenta")) {
                    setPuntoVentaSeleccionado(String(pvData.body[0].PveIdInPuntoVenta));
                  }
                }
              })
              .catch((err) => console.error("Error al obtener puntos de venta:", err));
          }

          if (data.body.infoPuntoVenta) {
            storage.setItem("infoPuntoVenta", JSON.stringify(data.body.infoPuntoVenta));
            if (!permite || !storage.getItem("puntoVenta")) {
              storage.setItem("puntoVenta", String(data.body.infoPuntoVenta.PveIdInPuntoVenta));
              setPuntoVentaSeleccionado(String(data.body.infoPuntoVenta.PveIdInPuntoVenta));
            }
          }
        }
      })
      .catch((err) => console.error("Error al cargar config-app en Login:", err));
  }, []);

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!usuario.trim() || !clave.trim()) {
      return;
    }

    if (!nombreTerminal.trim()) {
      setError("Por favor ingrese el nombre del dispositivo");
      return;
    }

    if (permiteSeleccionarPunto && !puntoVentaSeleccionado && !storage.getItem("puntoVenta")) {
      setError("Por favor seleccione el Punto de Venta");
      return;
    }

    setEnviando(true);
    setError("");

    // Si coincide con la guardada es 0, si cambió o es nueva es 1 (crear terminal)
    const esPrimeraVezCalculado = nombreTerminal.trim() === storage.getItem("terminal") ? 0 : 1;

    try {
      const resp = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idUsu: usuario,
          password: clave,
          nombre_terminal: nombreTerminal,
          es_primera_vez: esPrimeraVezCalculado,
          punto: puntoVentaSeleccionado || storage.getItem("puntoVenta"),
        }),
      });

      const textoRespuesta = await resp.text();
      const data = intentarParsearJson(textoRespuesta);
      const respuestaEsHtml = /<(!DOCTYPE|html)/i.test(textoRespuesta);

      if (!resp.ok || data?.error) {
        const mensajeBackend = extraerMensajeError(data, textoRespuesta);

        if (resp.status === 401) {
          throw new Error(mensajeBackend || "Usuario o clave invalida");
        }

        if (respuestaEsHtml) {
          throw new Error("#H45");
        }

        throw new Error(mensajeBackend || `Error de login (${resp.status})`);
      }

      if (!data && respuestaEsHtml) {
        throw new Error("#JH34");
      }

      const token = extraerToken(data);
      if (!token) {
        throw new Error("#Log9");
      }

      storage.setItem("token", token);
      storage.setItem("last_login", Date.now().toString());
      storage.setItem("last_activity_time", Date.now().toString());
      storage.setItem("terminal", nombreTerminal.trim()); // Guardar terminal
      storage.setItem("usuarioLogueado", usuario.trim().toUpperCase());
      
      const pVal = puntoVentaSeleccionado || data?.body?.infoPuntoVenta?.PveIdInPuntoVenta;
      if (pVal) {
        storage.setItem("puntoVenta", String(pVal));
      }
      
      if (data?.body) {
        if (data.body.vendedor) {
          storage.setItem("vendedor", JSON.stringify(data.body.vendedor));
        }
        if (data.body.infoPuntoVenta) {
          storage.setItem("infoPuntoVenta", JSON.stringify(data.body.infoPuntoVenta));
        }
        if (data.body.usuario) {
          storage.setItem("usuario", JSON.stringify(data.body.usuario));
        }
        const bodyData = data.body as any;
        if (bodyData.obligatorioImprimir) {
          storage.setItem("obligatorioImprimir", String(bodyData.obligatorioImprimir));
        }
        if (bodyData.permiteSeleccionarPuntoVenta !== undefined) {
          storage.setItem("permiteSeleccionarPuntoVenta", String(bodyData.permiteSeleccionarPuntoVenta));
        }
        if (bodyData.inactividadHoras !== undefined) {
          const val = Number(bodyData.inactividadHoras);
          if (isNaN(val) || val < 0.05) {
            storage.setItem("config_inactividadHoras", "0");
          } else {
            storage.setItem("config_inactividadHoras", String(val));
          }
        }
        if (bodyData.pollingSegundos !== undefined) {
          storage.setItem("config_pollingSegundos", String(bodyData.pollingSegundos));
        }
      }

      // Si existe localstorage de lineas (config anterior), se limpia
      storage.removeItem("lineas");

      onLogin();
    } catch (err) {
      const mensajeOriginal = err instanceof Error ? err.message : "Error de login";
      const mensaje = sanitizarError(mensajeOriginal);
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-container">
      <main className="login-card-premium">
        <div className="login-logo-wrapper">
          <img src={logo} alt="Dianasis Logo" className="login-logo-img" />
        </div>

        <h1 className="login-title">Iniciar Sesión</h1>

        <form onSubmit={(e) => void manejarSubmit(e)}>
          <div className="login-form-group">
            <div className="login-input-wrapper">
              <FaUser className="login-input-icon" />
              <input
                type="text"
                className="login-input"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Usuario"
                required
              />
            </div>
          </div>

          <div className="login-form-group">
            <div className="login-input-wrapper">
              <FaLock className="login-input-icon" />
              <input
                type={verClave ? "text" : "password"}
                className="login-input"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Contraseña"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setVerClave(!verClave)}
                aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verClave ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {/* Campo nombre de dispositivo / terminal (solo si no está guardado en localStorage) */}
          {!tieneTerminalGuardada && (
            <div className="login-form-group">
              <div className="login-input-wrapper">
                <FaDesktop className="login-input-icon" />
                <input
                  type="text"
                  className="login-input"
                  value={nombreTerminal}
                  onChange={(e) => setNombreTerminal(e.target.value)}
                  placeholder="Nombre del dispositivo"
                  required
                />
              </div>
            </div>
          )}

          {/* Campo selección de Punto de Venta (solo si está habilitado en el .env) */}
          {permiteSeleccionarPunto && (
            <div className="login-form-group">
              <div className="login-input-wrapper">
                <FaMapMarkerAlt className="login-input-icon" style={{ color: '#94a3b8' }} />
                <select
                  className="login-input"
                  value={puntoVentaSeleccionado}
                  onChange={(e) => setPuntoVentaSeleccionado(e.target.value)}
                  required
                  style={{ cursor: 'pointer', appearance: 'auto', background: '#ffffff', color: '#1e293b' }}
                >
                  <option value="" disabled>Seleccione el Punto de Venta</option>
                  {puntosVentaList.map((p) => (
                    <option key={p.PveIdInPuntoVenta} value={p.PveIdInPuntoVenta}>
                      {p.PveStNombre} (Punto {p.PveIdInPuntoVenta})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* <div className="login-options">
            <label className="remember-me">
              <input type="checkbox" />
              Recordarme
            </label>
            <a href="#" className="forgot-password">¿Olvidaste tu contraseña?</a>
          </div> */}

          <button type="submit" className="login-btn-primary" disabled={enviando}>
            {enviando ? "Cargando..." : "Iniciar Sesión"}
          </button>

          {/* <div className="login-separator">
            <span>o</span>
          </div> */}

          {/* <a href="#" className="login-footer-link">
            ¿No tienes una cuenta? Contáctanos
          </a> */}

          {error && (
            <div className="login-error-alert" role="alert">
              {error}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}

