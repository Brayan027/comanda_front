import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export interface TicketOrden {
  nro_orden: string | number;
  mesa: string;
  mesero: string;
  numPersonas: number;
  fecha: string;
  hora: string;
  productos: {
    cantidad: number;
    ProStDescripcion: string;
    total: number;
    precioVenta: number;
    adicionales: {
      ProStDescripcion: string;
    }[];
  }[];
  totales: {
    subtotal: number;
    iva: number;
    impoconsumo: number;
    total: number;
  };
}

export interface TicketEmpresa {
  nombre: string;
  puntoVenta: string;
  empresaId: string;
}

const formatMoneda = (val: number) => {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

function crearTicketHTML(orden: TicketOrden, empresa: TicketEmpresa): string {
  return `
    <div style="text-align:center;font-size:12px;line-height:1.35;font-family:Arial,sans-serif;color:#000;">
      <strong style="font-size:14px;text-transform:uppercase;">${empresa.nombre || "DIANASIS RESTAURANTE"}</strong>
      <div style="font-size:11px;margin-top:2px;">PUNTO: ${empresa.puntoVenta || "PRINCIPAL"}</div>
      <div style="font-size:11px;">Empresa: ${empresa.empresaId || "02"}</div>
    </div>
    <div style="border-top:2px dashed #000;margin:10px 0;"></div>
    <div style="font-size:12px;line-height:1.45;font-family:Arial,sans-serif;color:#000;">
      <div style="text-align:center;font-weight:700;font-size:13px;margin-bottom:6px;">TICKET DE COMANDA</div>
      <div><strong>Orden No:</strong> #${orden.nro_orden}</div>
      <div><strong>Mesa:</strong> ${orden.mesa}</div>
      <div><strong>Mesero:</strong> ${orden.mesero}</div>
      <div><strong>Personas:</strong> ${orden.numPersonas}</div>
      <div><strong>Fecha:</strong> ${orden.fecha} <strong>Hora:</strong> ${orden.hora}</div>
    </div>
    <div style="border-top:1px dashed #000;margin:8px 0;"></div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:Arial,sans-serif;color:#000;">
      <thead>
        <tr>
          <th style="text-align:left;border-bottom:1px solid #000;padding-bottom:4px;width:10%;">Cant</th>
          <th style="text-align:left;border-bottom:1px solid #000;padding-bottom:4px;width:65%;">Producto</th>
          <th style="text-align:right;border-bottom:1px solid #000;padding-bottom:4px;width:25%;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${orden.productos.map((p) => `
          <tr>
            <td style="vertical-align:top;padding:6px 0;font-weight:bold;">${p.cantidad}</td>
            <td style="vertical-align:top;padding:6px 4px;">
              <div style="font-weight:bold;text-transform:uppercase;">${p.ProStDescripcion}</div>
              ${p.adicionales && p.adicionales.length > 0 ? `
                <div style="font-size:9.5px;color:#333;padding-left:8px;margin-top:2px;font-style:italic;">
                  ${p.adicionales.map((ad) => `+ ${ad.ProStDescripcion}`).join("<br/>")}
                </div>
              ` : ""}
            </td>
            <td style="vertical-align:top;text-align:right;padding:6px 0;font-weight:bold;">${formatMoneda(p.total)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div style="border-top:2px dashed #000;margin:10px 0;"></div>
    <div style="font-size:11px;line-height:1.5;font-family:Arial,sans-serif;color:#000;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong style="white-space:nowrap;">${formatMoneda(orden.totales.subtotal)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>IVA (Deducido)</span><strong style="white-space:nowrap;">${formatMoneda(orden.totales.iva)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>INC (Deducido 8%)</span><strong style="white-space:nowrap;">${formatMoneda(orden.totales.impoconsumo)}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:6px;border-top:1px solid #000;padding-top:4px;"><strong>TOTAL</strong><strong>${formatMoneda(orden.totales.total)}</strong></div>
    </div>
    <div style="text-align:center;font-size:10px;margin-top:20px;font-family:Arial,sans-serif;color:#000;">
      <i>Gracias por su visita</i>
    </div>
  `;
}

export async function generarPDF(orden: TicketOrden, empresa: TicketEmpresa): Promise<File> {
  const ticket = document.createElement("div");
  ticket.style.position = "absolute";
  ticket.style.left = "-9999px";
  ticket.style.top = "0";
  ticket.style.width = "300px";
  ticket.style.padding = "16px";
  ticket.style.background = "#ffffff";
  ticket.style.color = "#000000";
  ticket.innerHTML = crearTicketHTML(orden, empresa);

  document.body.appendChild(ticket);

  try {
    const esMovil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const scaleValue = esMovil ? 1.6 : 2.5;

    const canvas = await html2canvas(ticket, {
      scale: scaleValue,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = 76;
    const pageHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [imgWidth, pageHeight + 8],
    });
    pdf.addImage(imgData, "PNG", 0, 4, imgWidth, pageHeight);
    const blob = pdf.output("blob");
    return new File([blob], `comanda_mesa_${orden.mesa}_orden_${orden.nro_orden}.pdf`, {
      type: "application/pdf",
    });
  } finally {
    document.body.removeChild(ticket);
  }
}

export async function descargarPDF(orden: TicketOrden, empresa: TicketEmpresa): Promise<void> {
  const pdf = await generarPDF(orden, empresa);
  const url = URL.createObjectURL(pdf);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdf.name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function compartirPDF(orden: TicketOrden, empresa: TicketEmpresa): Promise<boolean> {
  const pdf = await generarPDF(orden, empresa);

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdf] }))) {
    try {
      await navigator.share({
        files: [pdf],
        title: `Comanda_Mesa_${orden.mesa}_Orden_${orden.nro_orden}.pdf`,
      });
      return true;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err && (err as Error).name === "AbortError") {
        return true;
      }
      return false;
    }
  }
  return false;
}
