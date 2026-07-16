import { useState } from "react";
import type { FormEvent } from "react";
import { LOGIN_URL, sanitizarError } from "../config/api";
import { FaUser, FaLock, FaEye, FaEyeSlash, FaDesktop } from "react-icons/fa";
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

  // Cargar estado inicial del dispositivo desde localStorage (si existe)
  const [nombreTerminal, setNombreTerminal] = useState(() => localStorage.getItem("terminal") || "");

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!usuario.trim() || !clave.trim()) {
      return;
    }

    if (!nombreTerminal.trim()) {
      setError("Por favor ingrese el nombre del dispositivo");
      return;
    }

    setEnviando(true);
    setError("");

    // Si coincide con la guardada es 0, si cambió o es nueva es 1 (crear terminal)
    const esPrimeraVezCalculado = nombreTerminal.trim() === localStorage.getItem("terminal") ? 0 : 1;

    try {
      const resp = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idUsu: usuario,
          password: clave,
          nombre_terminal: nombreTerminal,
          es_primera_vez: esPrimeraVezCalculado,
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

      localStorage.setItem("token", token);
      localStorage.setItem("last_login", Date.now().toString());
      localStorage.setItem("terminal", nombreTerminal.trim()); // Guardar terminal
      
      if (data?.body) {
        if (data.body.vendedor) {
          localStorage.setItem("vendedor", JSON.stringify(data.body.vendedor));
        }
        if (data.body.infoPuntoVenta) {
          localStorage.setItem("infoPuntoVenta", JSON.stringify(data.body.infoPuntoVenta));
        }
        if (data.body.usuario) {
          localStorage.setItem("usuario", JSON.stringify(data.body.usuario));
        }
      }

      // Si existe localstorage de lineas (config anterior), se limpia
      localStorage.removeItem("lineas");

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

          {/* Campo nombre de dispositivo / terminal siempre visible */}
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

