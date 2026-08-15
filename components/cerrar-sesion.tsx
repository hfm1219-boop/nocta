"use client";

import { useRouter } from "next/navigation";
import { crearClienteSupabase } from "@/lib/supabase/client";

export function CerrarSesion() {
  const router=useRouter();
  return <button className="text-xs text-muted" onClick={async()=>{await crearClienteSupabase()?.auth.signOut();router.replace("/login");router.refresh();}}>Cerrar sesión</button>;
}

