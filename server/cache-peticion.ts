import { AsyncLocalStorage } from "node:async_hooks";

const local = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/** Una sola ida a la red por clave, dentro del turno o del request. */
export function recordar<T>(clave: string, cargar: () => Promise<T>): Promise<T> {
  const cache = local.getStore();
  if (!cache) return cargar();
  const previa = cache.get(clave);
  if (previa) return previa as Promise<T>;
  const promesa = cargar().catch((err) => {
    cache.delete(clave);
    throw err;
  });
  cache.set(clave, promesa);
  return promesa;
}

export function olvidarSi(predicado: (clave: string) => boolean): void {
  const cache = local.getStore();
  if (!cache) return;
  const borrar: string[] = [];
  cache.forEach((_valor, clave) => {
    if (predicado(clave)) borrar.push(clave);
  });
  for (let i = 0; i < borrar.length; i++) cache.delete(borrar[i]);
}

export function olvidarSesion(sessionId: string): void {
  if (!sessionId) return;
  olvidarSi((clave) => clave.includes(sessionId));
}

/** Solo la charla. El perfil y la memoria del mismo turno siguen en caché. */
export function olvidarMensajes(sessionId: string): void {
  olvidarSi((clave) => clave === `mensajesCount:${sessionId}` || clave.startsWith(`mensajes:${sessionId}:`));
}

export function olvidarTodo(): void {
  local.getStore()?.clear();
}

export function conCache<T>(fn: () => T): T {
  return local.run(new Map(), fn);
}
