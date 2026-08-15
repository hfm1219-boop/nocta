"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteSupabase } from "@/lib/supabase/client";

export default function ActualizarContrasena() {
  const router = useRouter(); const [password,setPassword]=useState(""); const [mensaje,setMensaje]=useState("");
  async function guardar(e:FormEvent){e.preventDefault();const supabase=crearClienteSupabase();if(!supabase)return setMensaje("Supabase no configurado.");const {error}=await supabase.auth.updateUser({password});if(error)return setMensaje(error.message);setMensaje("Contraseña actualizada.");setTimeout(()=>router.replace("/accesos"),700)}
  return <main className="flex-1 px-5 py-12 max-w-md mx-auto w-full"><form onSubmit={guardar} className="card p-6 space-y-4"><p className="text-xs uppercase text-neon2">Seguridad</p><h1 className="text-2xl font-bold">Nueva contraseña</h1><input type="password" minLength={10} required value={password} onChange={e=>setPassword(e.target.value)} className="entrada" placeholder="Mínimo 10 caracteres"/><button className="btn-neon w-full rounded-2xl p-4 font-bold">Guardar contraseña</button>{mensaje&&<p className="text-sm text-neon3">{mensaje}</p>}</form></main>;
}

