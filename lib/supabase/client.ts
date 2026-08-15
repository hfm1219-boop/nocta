import { createBrowserClient } from "@supabase/ssr";
import { variablesSupabase } from "./config";

export function crearClienteSupabase() {
  const config = variablesSupabase();
  return config ? createBrowserClient(config.url, config.key) : null;
}

