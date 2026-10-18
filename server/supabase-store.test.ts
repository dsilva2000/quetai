import assert from "node:assert/strict";
import { test } from "node:test";
import { conCache } from "./cache-peticion.ts";
import { storeActivo } from "./store-kind.ts";
import { crearAlmacenSupabase, crearClienteRest } from "./supabase-store.ts";

const URL = "https://enypjatzskpnupiqfaoa.supabase.co";
const KEY = "sb_secret_no_imprimir";

test("sin las dos variables el almacén es sqlite", () => {
  assert.equal(storeActivo({}), "sqlite");
  assert.equal(storeActivo({ SUPABASE_URL: URL }), "sqlite");
  assert.equal(storeActivo({ SUPABASE_SERVICE_KEY: KEY }), "sqlite");
  assert.equal(storeActivo({ SUPABASE_URL: URL, SUPABASE_SERVICE_KEY: KEY }), "supabase");
});

test("el cliente manda apikey y Bearer, y el error no trae la clave", async () => {
  const pedir = crearClienteRest(URL, KEY, async (input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), KEY);
    assert.equal(headers.get("Authorization"), `Bearer ${KEY}`);
    assert.equal(String(input).includes(KEY), false);
    return new Response(JSON.stringify({ message: "relation usuarios does not exist" }), { status: 404 });
  });
  await assert.rejects(pedir("usuarios?select=id"), (err: any) => {
    assert.match(err.message, /supabase 404/);
    assert.equal(String(err.message).includes(KEY), false);
    assert.equal(String(err.message).includes("sb_secret"), false);
    return true;
  });
});

test("el perfil se lee una vez por turno y se invalida al guardar", async () => {
  const llamadas: string[] = [];
  const filas = new Map<string, any>();
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    llamadas.push(`${method} ${url}`);
    if (method === "GET") {
      const row = filas.get("s1");
      return new Response(JSON.stringify(row ? [row] : []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const body = JSON.parse(String(init?.body || "{}"));
    filas.set("s1", { session_id: "s1", apodo: "", temas: "", evitar: "", familia: "", notas: "", ...body });
    return new Response(null, { status: 201 });
  };
  const store = crearAlmacenSupabase({ SUPABASE_URL: URL, SUPABASE_SERVICE_KEY: KEY }, fetchImpl);
  await conCache(async () => {
    assert.equal((await store.getPerfil("s1")).apodo, "");
    assert.equal((await store.getPerfil("s1")).apodo, "");
    assert.equal(llamadas.length, 1);
    const guardado = await store.savePerfil("s1", { apodo: "Queta" });
    assert.equal(guardado.apodo, "Queta");
    assert.equal((await store.getPerfil("s1")).apodo, "Queta");
  });
  const gets = llamadas.filter((l) => l.startsWith("GET"));
  assert.equal(gets.length, 2);
});

test("un usuario de Alexa lee el nombre embebido y no pisa el que ya estaba", async () => {
  const posts: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    if (method === "POST") posts.push(url);
    if (url.includes("alexa_usuarios?") && method === "GET") {
      return new Response(JSON.stringify([{
        alexa_user_id: "amzn1.ask.account.ABC",
        session_id: "alexa:amzn1.ask.account.ABC",
        locale: "es-MX",
        usuarios: { nombre: "Enriqueta" },
      }]), { status: 200 });
    }
    if (url.includes("/usuarios?") && method === "GET") {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const store = crearAlmacenSupabase({ SUPABASE_URL: URL, SUPABASE_SERVICE_KEY: KEY }, fetchImpl);
  const link = await store.getAlexaUsuario("amzn1.ask.account.ABC");
  assert.equal(link?.nombre, "Enriqueta");
  assert.equal(link?.sessionId, "alexa:amzn1.ask.account.ABC");
  const otra = await store.registerAlexaUsuario("amzn1.ask.account.ABC", "Otra", "es-US");
  assert.equal(otra.nombre, "Enriqueta");
  assert.equal(posts.length, 0);
});

test("borrar una persona es un solo DELETE de usuarios", async () => {
  let borrado = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    if ((init?.method || "GET") === "DELETE") borrado = String(input);
    return new Response(null, { status: 204 });
  };
  const store = crearAlmacenSupabase({ SUPABASE_URL: URL, SUPABASE_SERVICE_KEY: KEY }, fetchImpl);
  await store.deleteUsuario("alexa:abc");
  assert.match(borrado, /\/rest\/v1\/usuarios\?/);
  assert.match(borrado, /session_id=eq\.alexa%3Aabc/);
});
