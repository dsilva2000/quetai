export interface MensajeMemoria {
  orden: number;
  rol: string;
  contenido: string;
}

/**
 * Mensajes ya no cubiertos por el resumen y que ya no caben en la ventana reciente.
 * Devuelve null si todavía no hay suficiente material nuevo.
 */
export function elegirMensajesParaMemoria(
  mensajes: MensajeMemoria[],
  hastaOrden: number,
  ventana = 8,
): { paraResumir: MensajeMemoria[]; nuevoHasta: number } | null {
  const pendientes = mensajes.filter((m) => m.orden >= hastaOrden);
  if (pendientes.length <= ventana) return null;
  const paraResumir = pendientes.slice(0, pendientes.length - ventana);
  if (paraResumir.length < 4) return null;
  const nuevoHasta = paraResumir[paraResumir.length - 1].orden + 1;
  return { paraResumir, nuevoHasta };
}

export function textoParaResumir(anterior: string, mensajes: MensajeMemoria[]): string {
  const turno = mensajes
    .map((m) => `${m.rol === "user" ? "Persona" : "Asistente"}: ${m.contenido}`)
    .join("\n");
  return `Resumen anterior:\n${anterior.trim() || "(vacío)"}\n\nConversación nueva:\n${turno}`;
}
