import Swal from 'sweetalert2';

type ProductoDetalle = {
  clase: string;
  unidad: string;
  cantidad: number;
  valorUnitario: number;
  valorTotal: number;
};

function formatoNumero(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(valor);
}

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export default function mostrarDetalleProducto(producto: ProductoDetalle) {
  return Swal.fire({
    title: "Detalle del producto",
    html: `
      <div style="text-align:left; line-height:1.6;">
        <p><strong>Clase:</strong> ${producto.clase || "-"}</p>
        <p><strong>Unidad:</strong> ${producto.unidad || "-"}</p>
        <p><strong>Cantidad:</strong> ${formatoNumero(producto.cantidad)}</p>
        <p><strong>Valor unitario:</strong> ${formatoMoneda(producto.valorUnitario)}</p>
        <p><strong>Valor total:</strong> ${formatoMoneda(producto.valorTotal)}</p>
      </div>
    `,
    icon: "info",
    confirmButtonText: "Cerrar",
  });
}
