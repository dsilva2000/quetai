/** supabase cuando hay URL y clave de servicio. Si falta una, se queda en SQLite. */
export function storeActivo(env: NodeJS.ProcessEnv = process.env): "supabase" | "sqlite" {
  const url = (env.SUPABASE_URL || "").trim();
  const key = (env.SUPABASE_SERVICE_KEY || "").trim();
  if (url && key) return "supabase";
  return "sqlite";
}

export function supabaseConfig(env: NodeJS.ProcessEnv = process.env): { url: string; key: string } | null {
  if (storeActivo(env) !== "supabase") return null;
  return {
    url: (env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
    key: (env.SUPABASE_SERVICE_KEY || "").trim(),
  };
}
