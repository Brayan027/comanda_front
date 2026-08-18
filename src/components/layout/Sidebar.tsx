import { useState } from "react";
import { FiHome, FiLogOut, FiMenu, FiLayers, FiList, FiClock, FiMapPin } from "react-icons/fi";
import logoReporte from "../../assets/LogoReportes.png";
import { isMandatoryPrintEnabled, isMobileOrTabletDevice } from "../../config/api";
import { storage } from "../../utils/storage";


export type MenuKey = "home" | "comanda" | "ordenes" | "pendientes";
type SidebarProps = {
    activo: MenuKey;
    onCambiar: (menu: MenuKey) => void;
    onSalir: () => void;
    empresaNombre?: string;
    puntoNombre?: string;
    fechaActual?: string;
    terminal?: string;
    cantPendientes?: number;
    esObligatorioImprimir?: boolean;
};

export default function Sidebar({ activo, onCambiar, onSalir, empresaNombre, puntoNombre, fechaActual, terminal, cantPendientes = 0, esObligatorioImprimir }: SidebarProps) {
    const [abierto, setAbierto] = useState(false);

    const storedInfo = (() => {
        try {
            const s = storage.getItem("infoPuntoVenta");
            return s ? JSON.parse(s) : null;
        } catch {
            return null;
        }
    })();

    const nombreEmpresaFinal = empresaNombre || storedInfo?.gmpnomb || storedInfo?.PveStNombreEmpresa || "GRUPO EMPRESARIAL URSA SAS";
    const nombrePuntoFinal = puntoNombre || storedInfo?.PveStNombre || "";

    const esObligatorio = esObligatorioImprimir !== undefined ? esObligatorioImprimir : isMandatoryPrintEnabled();
    const esMovilOTablet = isMobileOrTabletDevice();
    const usarInterfazClasica = esObligatorio || esMovilOTablet;

    const opciones = usarInterfazClasica
        ? [
            { key: "home" as const, label: "Inicio", icon: FiHome },
            { key: "comanda" as const, label: "Crear órdenes", icon: FiLayers },
            { key: "ordenes" as const, label: "Órdenes abiertas", icon: FiList },
        ]
        : [
            { key: "home" as const, label: "Inicio", icon: FiHome },
            { key: "comanda" as const, label: "Crear órdenes", icon: FiLayers },
            { key: "pendientes" as const, label: "Pedidos pendientes", icon: FiClock },
        ];

    function seleccionar(menu: MenuKey) {
        onCambiar(menu);
        setAbierto(false);
    }


    return (
        <>
            {/* HEADER MÓVIL (Solo se ve en móvil) */}
            <header className="mobile-header d-lg-none d-flex align-items-center justify-content-between w-100" style={{ paddingLeft: '12px', paddingRight: '12px', paddingTop: '3px', paddingBottom: '3px', gap: '6px', minHeight: '46px' }}>
                <div className="d-flex align-items-center flex-shrink-0" style={{ gap: '6px' }}>
                    <button
                        className="mobile-menu-btn m-0 flex-shrink-0"
                        onClick={() => setAbierto(true)}
                        style={{
                            width: '26px',
                            height: '26px',
                            minWidth: '26px',
                            minHeight: '26px',
                            maxWidth: '26px',
                            maxHeight: '26px',
                            borderRadius: '6px',
                            background: '#e31b23',
                            border: 'none',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 1px 3px rgba(227, 27, 35, 0.25)',
                            padding: 0,
                            lineHeight: 1
                        }}
                    >
                        <FiMenu size={14} />
                    </button>
                    <div className="mobile-brand flex-shrink-0 d-flex align-items-center" style={{ margin: 0, padding: 0 }}>
                        <img
                            src={logoReporte}
                            alt="Logo Dianasis"
                            style={{ height: '44px', maxHeight: '44px', width: 'auto', display: 'block', cursor: 'pointer' }}
                            onClick={() => setAbierto(false)}
                        />
                    </div>
                </div>

                {/* Info de sesión compacta a la derecha (Empresa en Línea 1, Punto de Venta en Línea 2) */}
                {fechaActual && (
                    <div className="text-end text-muted d-flex flex-column align-items-end justify-content-center flex-grow-1" style={{ minWidth: 0, overflow: 'hidden', paddingLeft: '4px' }}>
                        <span className="fw-bold text-dark text-truncate w-100" style={{ textTransform: 'uppercase', letterSpacing: '0.01em', fontSize: '0.58rem', lineHeight: '1.1', display: 'block' }} title={nombreEmpresaFinal}>
                            {nombreEmpresaFinal}
                        </span>
                        {nombrePuntoFinal && (
                            <span className="fw-bold text-danger text-truncate w-100" style={{ textTransform: 'uppercase', fontSize: '0.56rem', lineHeight: '1.1', display: 'block' }} title={nombrePuntoFinal}>
                                📍 {nombrePuntoFinal}
                            </span>
                        )}
                        {fechaActual === "CONFIGURAR FECHA DE TRABAJO" ? (
                            <span className="badge bg-danger text-white fw-bold text-truncate w-100 animate__animated animate__pulse animate__infinite" style={{ fontSize: '0.52rem', marginTop: '2px', lineHeight: '1.1', display: 'block', padding: '2px 4px' }}>
                                ⚠️ CONFIGURAR FECHA DE TRABAJO
                            </span>
                        ) : (
                            <span className="fw-semibold text-secondary text-truncate w-100 animate__animated animate__fadeIn" style={{ fontSize: '0.52rem', marginTop: '1px', lineHeight: '1.1', display: 'block' }}>
                                {fechaActual} {terminal ? `• ${terminal.toUpperCase()}` : ''}
                            </span>
                        )}
                    </div>
                )}
            </header>

            {/* OVERLAY PARA CERRAR EN MÓVIL */}
            {abierto && <div className="sidebar-overlay d-lg-none" onClick={() => setAbierto(false)} />}

            {/* SIDEBAR PRINCIPAL */}
            <aside className={`premium-sidebar ${abierto ? "is-open" : ""}`} style={{ background: '#ffffff' }}>
                <div
                    className="sidebar-header d-flex flex-column align-items-start justify-content-start border-bottom w-100"
                    style={{
                        paddingTop: '16px',
                        paddingBottom: '12px',
                        paddingLeft: '16px',
                        paddingRight: '16px',
                        gap: '4px'
                    }}
                >
                    <div className="d-flex align-items-center justify-content-start w-100">
                        <img
                            src={logoReporte}
                            alt="Logo Reportes"
                            style={{
                                width: '150px',
                                height: 'auto',
                                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))',
                            }}
                            className="animate__animated animate__fadeIn"
                        />
                    </div>

                    {/* Información de Sesión Activa (Diseño limpio, espacioso y sin sobrecarga de cards) */}
                    {(nombreEmpresaFinal || fechaActual) && (
                        <div
                            className="session-info-sidebar w-100 text-start mt-2 mb-2 animate__animated animate__fadeIn"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}
                        >
                            {/* EMPRESA */}
                            <div
                                className="fw-bold text-truncate"
                                style={{
                                    fontSize: '0.64rem',
                                    color: '#94a3b8',
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase'
                                }}
                                title={nombreEmpresaFinal}
                            >
                                {nombreEmpresaFinal}
                            </div>

                            {/* PUNTO DE VENTA (Limpio, destacado y con buen espacio) */}
                            {nombrePuntoFinal && (
                                <div
                                    className="d-flex align-items-center gap-1.5 fw-bold text-truncate"
                                    style={{
                                        fontSize: '0.94rem',
                                        color: '#e31b23',
                                        fontWeight: 800,
                                        letterSpacing: '-0.01em',
                                        lineHeight: '1.25'
                                    }}
                                    title={`Punto de Venta: ${nombrePuntoFinal}`}
                                >
                                    <FiMapPin size={15} className="flex-shrink-0" style={{ color: '#e31b23' }} />
                                    <span className="text-truncate" style={{ textTransform: 'uppercase' }}>{nombrePuntoFinal}</span>
                                </div>
                            )}

                            {/* FECHA Y TERMINAL */}
                            <div
                                className="d-flex align-items-center gap-1.5 flex-wrap mt-0.5"
                                style={{
                                    fontSize: '0.71rem',
                                    fontWeight: 500,
                                    color: '#64748b'
                                }}
                            >
                                {fechaActual === "CONFIGURAR FECHA DE TRABAJO" ? (
                                    <span className="badge bg-danger text-white fw-bold py-1 px-2 animate__animated animate__pulse animate__infinite" style={{ fontSize: '0.66rem' }}>
                                        ⚠️ CONFIGURAR FECHA DE TRABAJO
                                    </span>
                                ) : (
                                    <span>{fechaActual}</span>
                                )}
                                {terminal && (
                                    <>
                                        <span style={{ color: '#cbd5e1' }}>•</span>
                                        <span className="d-inline-flex align-items-center gap-1 text-success fw-bold" style={{ fontSize: '0.68rem' }}>
                                            <span
                                                className="rounded-circle d-inline-block bg-success"
                                                style={{ width: '5px', height: '5px' }}
                                            ></span>
                                            {terminal.toUpperCase()}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>


                <nav className="sidebar-nav" style={{ paddingTop: '10px' }}>

                    <ul className="nav-list">
                        {opciones.map((op) => {
                            const Icon = op.icon;
                            const esActivo = activo === op.key;
                            return (
                                <li key={op.key}>
                                    <button
                                        className={`nav-item ${esActivo ? "active" : ""}`}
                                        onClick={() => seleccionar(op.key)}
                                        style={{ position: 'relative', textAlign: 'left' }}
                                    >
                                        <div className="nav-icon-box">
                                            <Icon size={18} />
                                        </div>
                                        <span style={{ flex: 1, textAlign: 'left' }}>{op.label}</span>
                                        {op.key === "pendientes" && cantPendientes > 0 && (
                                             <span
                                                className="badge rounded-pill bg-danger text-white me-2 px-2 py-1 fw-bold badge-latido"
                                                style={{ fontSize: '0.7rem', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' }}
                                            >
                                                {cantPendientes}
                                            </span>
                                        )}

                                        {esActivo && (
                                            <div className="animate__animated animate__fadeInRight" style={{ width: '4px', height: '18px', background: '#ef4444', borderRadius: '2px' }}></div>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="sidebar-footer">
                    <button className="btn-logout-sidebar shadow-sm" onClick={onSalir}>
                        <FiLogOut size={18} />
                        <span>Cerrar Sesión</span>
                    </button>
                    <div className="text-center mt-3" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        v1.3 • DIANASIS
                    </div>
                </div>
            </aside>
        </>
    );
}




