export interface PerfilCampos {
  sessionId: string;
  apodo: string;
  temas: string;
  evitar: string;
  familia: string;
  notas: string;
}

export function perfilVacio(sessionId: string): PerfilCampos {
  return { sessionId, apodo: "", temas: "", evitar: "", familia: "", notas: "" };
}

export function unirLista(actual: string, extra: string): string {
  const piezas = `${actual},${extra}`.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const pieza of piezas) {
    const clave = pieza.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(pieza);
  }
  return salida.join(", ");
}

export function mezclarCampo(
  clave: "apodo" | "temas" | "evitar" | "familia" | "notas",
  actual: string,
  entrante: string | undefined,
  modo: "replace" | "append",
): string {
  if (entrante === undefined) return actual;
  const valor = String(entrante).trim();
  if (modo !== "append" || clave === "apodo") return valor;
  if (!valor) return actual;
  if (clave === "notas") {
    if (!actual) return valor;
    if (actual.toLowerCase().includes(valor.toLowerCase())) return actual;
    return `${actual}. ${valor}`;
  }
  return unirLista(actual, valor);
}
