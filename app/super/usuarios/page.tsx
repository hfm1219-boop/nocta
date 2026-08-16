"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";

type RolAsignado = { role: AppRole; scope_type: string; scope_id?: string | null; scope_name?: string | null };
type UsuarioAcceso = { user_id: string; email: string; full_name: string; status: string; roles: RolAsignado[] };
type Alcance = { id: string; name: string; detail?: string };

export default function UsuariosRoles() {
  const [usuarios, setUsuarios] = useState<UsuarioAcceso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [seleccionado, setSeleccionado] = useState("");
  const [rol, setRol] = useState<AppRole>("promoter");
  const [alcance, setAlcance] = useState("promoter");
  const [scopeId, setScopeId] = useState("");
  const [establecimientos, setEstablecimientos] = useState<Alcance[]>([]);
  const [eventos, setEventos] = useState<Alcance[]>([]);

  function aplicarDirectorio(datos: { users?: UsuarioAcceso[]; venues?: Array<{id:string;name:string;city:string}>; events?: Array<{id:string;name:string;status:string}> }) {
    setUsuarios(datos.users ?? []);
    setEstablecimientos((datos.venues ?? []).map((item) => ({ id: item.id, name: item.name, detail: item.city })));
    setEventos((datos.events ?? []).map((item) => ({ id: item.id, name: item.name, detail: item.status })));
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    const respuesta = await fetch("/api/admin/access", { cache: "no-store" });
    const datos = await respuesta.json();
    setCargando(false);
    if (!respuesta.ok) return setMensaje(datos.error ?? "No fue posible consultar usuarios.");
    aplicarDirectorio(datos); setMensaje("");
  }, []);
  useEffect(() => {
    let activo = true;
    fetch("/api/admin/access", { cache: "no-store" }).then(async (respuesta) => {
      const datos = await respuesta.json();
      if (!activo) return;
      setCargando(false);
      if (!respuesta.ok) setMensaje(datos.error ?? "No fue posible consultar usuarios.");
      else aplicarDirectorio(datos);
    });
    return () => { activo = false; };
  }, []);

  function cambiarRol(nuevo: AppRole) {
    setRol(nuevo);
    setAlcance(nuevo === "promoter" ? "promoter" : nuevo.startsWith("platform_") ? "platform" : ["organizer"].includes(nuevo) ? "event" : nuevo === "customer" ? "customer" : "venue");
    setScopeId("");
  }

  async function asignar() {
    if (!seleccionado || (!["platform", "promoter", "customer"].includes(alcance) && !scopeId)) return;
    setMensaje("Guardando…");
    const respuesta = await fetch("/api/admin/access/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: seleccionado, role: rol, scopeType: alcance, scopeId }) });
    const datos = await respuesta.json();
    if (!respuesta.ok) return setMensaje(datos.error ?? "No fue posible asignar el rol.");
    setMensaje("Rol asignado correctamente."); await cargar();
  }

  return <main className="flex-1 px-5 py-8 max-w-5xl mx-auto w-full space-y-6">
    <header><p className="text-xs uppercase tracking-wider text-neon2">Gobierno de acceso</p><h1 className="text-3xl font-bold">Usuarios y roles</h1><p className="text-sm text-muted mt-1">Administra responsabilidades y alcances sin salir del panel.</p></header>
    <section className="card p-5 space-y-4"><h2 className="font-bold">Asignar acceso</h2><div className="grid md:grid-cols-2 gap-3">
      <label className="text-xs text-muted">Usuario<select className="entrada" value={seleccionado} onChange={(e)=>setSeleccionado(e.target.value)}><option value="">Selecciona un usuario</option>{usuarios.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name || u.email} · {u.email}</option>)}</select></label>
      <label className="text-xs text-muted">Rol<select className="entrada" value={rol} onChange={(e)=>cambiarRol(e.target.value as AppRole)}>{APP_ROLES.filter(r=>r!=="platform_owner").map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
      <label className="text-xs text-muted">Alcance<input className="entrada" value={alcance} readOnly /></label>
      {!['platform','promoter','customer'].includes(alcance)&&<label className="text-xs text-muted">{alcance === 'venue' ? 'Establecimiento' : 'Evento'}<select className="entrada" value={scopeId} onChange={(e)=>setScopeId(e.target.value)}><option value="">Selecciona {alcance === 'venue' ? 'un establecimiento' : 'un evento'}</option>{(alcance === 'venue' ? establecimientos : eventos).map(item=><option key={item.id} value={item.id}>{item.name}{item.detail ? ` · ${item.detail}` : ''}</option>)}</select></label>}
    </div><button onClick={asignar} className="btn-neon rounded-full px-5 py-3 font-semibold">Asignar rol</button>{mensaje&&<p className="text-sm text-neon3">{mensaje}</p>}</section>
    <section className="space-y-3"><h2 className="font-bold">Directorio</h2>{cargando?<p className="text-muted">Cargando…</p>:usuarios.map(u=><article key={u.user_id} className="card p-4"><div className="flex justify-between gap-3"><span><b>{u.full_name || "Sin nombre"}</b><span className="block text-xs text-muted">{u.email}</span></span><span className="text-xs text-muted">{u.status}</span></div><div className="flex flex-wrap gap-2 mt-3">{u.roles.map((r,i)=><span key={`${r.role}-${r.scope_id}-${i}`} className="rounded-full border border-neon2/40 px-3 py-1 text-xs text-neon2">{ROLE_LABELS[r.role]} · {r.scope_name || r.scope_type}</span>)}{!u.roles.length&&<span className="text-xs text-muted">Sin acceso asignado</span>}</div></article>)}</section>
  </main>;
}
