"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_ROLES, ORGANIZATION_ROLE_LABELS, PRINCIPAL_ROLE_LABELS, ROLE_LABELS, type AppRole, type OrganizationRole, type PrincipalRole } from "@/lib/auth/roles";

type RolAsignado = { role: AppRole; scope_type: string; scope_id?: string | null; scope_name?: string | null };
type UsuarioAcceso = { user_id: string; email: string; full_name: string; status: string; roles: RolAsignado[] };
type Alcance = { id: string; name: string; detail?: string };
type OrganizationItem={id:string;name:string;contexts:PrincipalRole[];venues:Array<{id:string;name:string}>};
type OrganizationAssignment={id:string;userId:string;organizationId:string;organizationName:string;context:PrincipalRole;role:OrganizationRole;venueId?:string|null;venueName?:string|null};
const CANONICAL_LEGACY_ROLES:Partial<Record<AppRole,OrganizationRole>>={venue_owner:"owner",venue_admin:"establishment_admin",bartender:"bar",waiter:"waiter",cashier:"cashier"};
const LEGACY_ONLY_OPERATORS:AppRole[]=["door_staff","reservation_host","dj","analyst"];

function deduplicateAccess(roles:RolAsignado[],canonical:OrganizationAssignment[]){
  const visibleRoles=roles.filter(role=>{if(role.role==="promoter"&&canonical.some(item=>item.context==="promoter"))return false;const mapped=CANONICAL_LEGACY_ROLES[role.role];if(!mapped)return true;return !canonical.some(item=>item.context==="establishment"&&item.role===mapped&&((role.scope_type==="venue"&&item.venueId===role.scope_id)||(role.scope_type==="organization"&&item.organizationId===role.scope_id)));});
  const visibleCanonical=canonical.filter(item=>!(item.role==="member"&&roles.some(role=>LEGACY_ONLY_OPERATORS.includes(role.role)&&((role.scope_type==="venue"&&item.venueId===role.scope_id)||(role.scope_type==="organization"&&item.organizationId===role.scope_id)))));
  return{visibleRoles,visibleCanonical};
}

export default function UsuariosRoles() {
  const [usuarios, setUsuarios] = useState<UsuarioAcceso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [seleccionado, setSeleccionado] = useState("");
  const [rol, setRol] = useState<AppRole>("customer");
  const [alcance, setAlcance] = useState("customer");
  const [scopeId, setScopeId] = useState("");
  const [establecimientos, setEstablecimientos] = useState<Alcance[]>([]);
  const [eventos, setEventos] = useState<Alcance[]>([]);
  const [confirmarQuitar, setConfirmarQuitar] = useState<{ userId:string; userName:string; role:RolAsignado }>();
  const [quitando, setQuitando] = useState(false);
  const [organizaciones,setOrganizaciones]=useState<OrganizationItem[]>([]);
  const [asignacionesOrganizacion,setAsignacionesOrganizacion]=useState<OrganizationAssignment[]>([]);
  const [organizacionId,setOrganizacionId]=useState("");
  const [contextoOrganizacion,setContextoOrganizacion]=useState<PrincipalRole>("establishment");
  const [rolOrganizacion,setRolOrganizacion]=useState<OrganizationRole>("member");
  const [sedeId,setSedeId]=useState("");
  const [confirmarQuitarOrganizacion,setConfirmarQuitarOrganizacion]=useState<OrganizationAssignment>();

  const aplicarDirectorio=useCallback((datos: { users?: UsuarioAcceso[]; organizationAccess?:{organizations?:OrganizationItem[];assignments?:OrganizationAssignment[]}; venues?: Array<{id:string;name:string;city:string}>; events?: Array<{id:string;name:string;status:string}> })=>{
    setUsuarios(datos.users ?? []);
    setEstablecimientos((datos.venues ?? []).map((item) => ({ id: item.id, name: item.name, detail: item.city })));
    setEventos((datos.events ?? []).map((item) => ({ id: item.id, name: item.name, detail: item.status })));
    setOrganizaciones(datos.organizationAccess?.organizations??[]);setAsignacionesOrganizacion(datos.organizationAccess?.assignments??[]);
    if(datos.organizationAccess?.organizations?.[0])setOrganizacionId(current=>current||datos.organizationAccess!.organizations![0].id);
  },[]);

  const cargar = useCallback(async () => {
    setCargando(true); setMensaje("");
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 15000);
    try { const respuesta = await fetch("/api/admin/access", { cache: "no-store", signal: controller.signal }); const datos = await respuesta.json(); if (!respuesta.ok) throw new Error(datos.error ?? "No fue posible consultar usuarios."); aplicarDirectorio(datos); }
    catch (reason) { setMensaje(reason instanceof DOMException && reason.name === "AbortError" ? "La consulta de usuarios tardó demasiado. Inténtalo nuevamente." : reason instanceof Error ? reason.message : "No fue posible consultar usuarios."); }
    finally { window.clearTimeout(timeout); setCargando(false); }
  }, [aplicarDirectorio]);
  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, [cargar]);

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
    setMensaje(rol === "customer" ? "Rol consumidor asignado y activado correctamente." : "Rol asignado correctamente."); await cargar();
  }

  async function quitar() {
    if (!confirmarQuitar) return;
    setQuitando(true); setMensaje("Retirando acceso…");
    const respuesta = await fetch("/api/admin/access/assign", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: confirmarQuitar.userId, role: confirmarQuitar.role.role, scopeType: confirmarQuitar.role.scope_type, scopeId: confirmarQuitar.role.scope_id }) });
    const datos = await respuesta.json(); setQuitando(false);
    if (!respuesta.ok) return setMensaje(datos.error ?? "No fue posible retirar el rol.");
    setConfirmarQuitar(undefined); setMensaje("Rol retirado correctamente."); await cargar();
  }

  async function asignarOrganizacion(){if(!seleccionado||!organizacionId)return;setMensaje("Guardando acceso empresarial…");const response=await fetch("/api/organizations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"set_member",organizationId:organizacionId,userId:seleccionado,context:contextoOrganizacion,role:rolOrganizacion,venueId:sedeId||undefined})});const body=await response.json();if(!response.ok)return setMensaje(body.error??"No fue posible asignar el acceso empresarial.");setMensaje("Acceso empresarial asignado.");await cargar()}
  async function quitarOrganizacion(){if(!confirmarQuitarOrganizacion)return;setQuitando(true);setMensaje("Retirando acceso empresarial…");const response=await fetch("/api/organizations",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:confirmarQuitarOrganizacion.organizationId,userId:confirmarQuitarOrganizacion.userId,context:confirmarQuitarOrganizacion.context,role:confirmarQuitarOrganizacion.role,venueId:confirmarQuitarOrganizacion.venueId})});const body=await response.json();setQuitando(false);if(!response.ok)return setMensaje(body.error==="LAST_OWNER_REQUIRED"?"No se puede retirar al último propietario de la organización.":body.error??"No fue posible retirar el acceso empresarial.");setConfirmarQuitarOrganizacion(undefined);setMensaje("Acceso empresarial retirado.");await cargar()}

  const organizacion=organizaciones.find(item=>item.id===organizacionId);const contextos=(organizacion?.contexts??[]).filter(role=>["establishment","promoter","brand_distributor"].includes(role));const rolesDisponibles:OrganizationRole[]=contextoOrganizacion==="establishment"?["owner","admin","member","establishment_admin","bar","waiter","cashier"]:["owner","admin","member"];

  return <main className="flex-1 px-5 py-8 max-w-5xl mx-auto w-full space-y-6">
    <header><p className="text-xs uppercase tracking-wider text-neon2">Gobierno de acceso</p><h1 className="text-3xl font-bold">Usuarios y roles</h1><p className="text-sm text-muted mt-1">Administra responsabilidades y alcances sin salir del panel.</p></header>
    <section className="card p-5 space-y-4"><h2 className="font-bold">Asignar acceso</h2><div className="grid md:grid-cols-2 gap-3">
      <label className="text-xs text-muted">Usuario<select className="entrada" value={seleccionado} onChange={(e)=>setSeleccionado(e.target.value)}><option value="">Selecciona un usuario</option>{usuarios.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name || u.email} · {u.email}</option>)}</select></label>
      <label className="text-xs text-muted">Rol<select className="entrada" value={rol} onChange={(e)=>cambiarRol(e.target.value as AppRole)}>{APP_ROLES.filter(r=>!['platform_owner','promoter','venue_owner','venue_admin','cashier','bartender','waiter'].includes(r)).map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select><span className="block mt-1">Promotores y roles de establecimiento se asignan como acceso empresarial.</span></label>
      <label className="text-xs text-muted">Alcance<input className="entrada" value={alcance} readOnly /></label>
      {!['platform','promoter','customer'].includes(alcance)&&<label className="text-xs text-muted">{alcance === 'venue' ? 'Establecimiento' : 'Evento'}<select className="entrada" value={scopeId} onChange={(e)=>setScopeId(e.target.value)}><option value="">Selecciona {alcance === 'venue' ? 'un establecimiento' : 'un evento'}</option>{(alcance === 'venue' ? establecimientos : eventos).map(item=><option key={item.id} value={item.id}>{item.name}{item.detail ? ` · ${item.detail}` : ''}</option>)}</select></label>}
    </div><button onClick={asignar} className="btn-neon rounded-full px-5 py-3 font-semibold">Asignar rol</button>{mensaje&&<p className="text-sm text-neon3">{mensaje}</p>}</section>
    <section className="card p-5 space-y-4"><div><h2 className="font-bold">Asignar acceso empresarial</h2><p className="text-sm text-muted">Roles canónicos dentro de una organización y contexto.</p></div><div className="grid md:grid-cols-2 gap-3"><label className="text-xs text-muted">Organización<select className="entrada" value={organizacionId} onChange={e=>{const id=e.target.value;setOrganizacionId(id);const first=organizaciones.find(item=>item.id===id)?.contexts.find(role=>["establishment","promoter","brand_distributor"].includes(role));if(first)setContextoOrganizacion(first)}}>{organizaciones.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs text-muted">Contexto<select className="entrada" value={contextoOrganizacion} onChange={e=>{setContextoOrganizacion(e.target.value as PrincipalRole);setRolOrganizacion("member");setSedeId("")}}>{contextos.map(role=><option key={role} value={role}>{PRINCIPAL_ROLE_LABELS[role]}</option>)}</select></label><label className="text-xs text-muted">Responsabilidad<select className="entrada" value={rolOrganizacion} onChange={e=>setRolOrganizacion(e.target.value as OrganizationRole)}>{rolesDisponibles.map(role=><option key={role} value={role}>{ORGANIZATION_ROLE_LABELS[role]}</option>)}</select></label>{contextoOrganizacion==="establishment"&&<label className="text-xs text-muted">Sede opcional<select className="entrada" value={sedeId} onChange={e=>setSedeId(e.target.value)}><option value="">Toda la organización</option>{organizacion?.venues.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>}</div><button type="button" disabled={!seleccionado||!organizacionId} onClick={()=>void asignarOrganizacion()} className="rounded-full border border-neon3/40 px-5 py-3 font-semibold text-neon3 disabled:opacity-40">Asignar acceso empresarial</button></section>
    <section className="space-y-3"><h2 className="font-bold">Directorio</h2>{cargando?<p className="text-muted" role="status">Cargando…</p>:usuarios.map(u=>{const canonical=asignacionesOrganizacion.filter(item=>item.userId===u.user_id);const{visibleRoles,visibleCanonical}=deduplicateAccess(u.roles,canonical);return <article key={u.user_id} className="card p-4"><div className="flex justify-between gap-3"><span><b>{u.full_name || "Sin nombre"}</b><span className="block text-xs text-muted">{u.email}</span></span><span className="text-xs text-muted">{u.status}</span></div><div className="flex flex-wrap gap-2 mt-3">{visibleRoles.map((r,i)=><button type="button" key={`${r.role}-${r.scope_id}-${i}`} onClick={()=>setConfirmarQuitar({userId:u.user_id,userName:u.full_name||u.email,role:r})} className="rounded-full border border-neon2/40 px-3 py-1 text-xs text-neon2 hover:border-danger/60 hover:text-danger" aria-label={`Quitar ${ROLE_LABELS[r.role]} a ${u.full_name||u.email}`}>{ROLE_LABELS[r.role]} · {r.scope_name || r.scope_type} <span aria-hidden="true">×</span></button>)}{visibleCanonical.map(r=><button type="button" key={r.id} onClick={()=>setConfirmarQuitarOrganizacion(r)} className="rounded-full border border-neon3/40 px-3 py-1 text-xs text-neon3 hover:border-danger/60 hover:text-danger">{ORGANIZATION_ROLE_LABELS[r.role]} · {r.organizationName}{r.venueName?` / ${r.venueName}`:""} <span aria-hidden="true">×</span></button>)}{!visibleRoles.length&&!visibleCanonical.length&&<span className="text-xs text-muted">Sin acceso asignado</span>}</div>{confirmarQuitar?.userId===u.user_id&&<div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-4"><p className="text-sm font-semibold">¿Retirar {ROLE_LABELS[confirmarQuitar.role.role]} de {confirmarQuitar.userName}?</p><p className="text-xs text-muted mt-1">Perderá el acceso a {confirmarQuitar.role.scope_name||confirmarQuitar.role.scope_type}. La acción quedará registrada en auditoría.</p><div className="flex gap-2 mt-3"><button type="button" disabled={quitando} onClick={()=>setConfirmarQuitar(undefined)} className="rounded-xl border border-line px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={quitando} onClick={()=>void quitar()} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{quitando?"Retirando…":"Confirmar retiro"}</button></div></div>}{confirmarQuitarOrganizacion?.userId===u.user_id&&<div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-4"><p className="text-sm font-semibold">¿Retirar {ORGANIZATION_ROLE_LABELS[confirmarQuitarOrganizacion.role]} de {u.full_name||u.email}?</p><p className="text-xs text-muted mt-1">Organización: {confirmarQuitarOrganizacion.organizationName}. Si era su último rol, la membresía quedará suspendida.</p><div className="flex gap-2 mt-3"><button type="button" disabled={quitando} onClick={()=>setConfirmarQuitarOrganizacion(undefined)} className="rounded-xl border border-line px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={quitando} onClick={()=>void quitarOrganizacion()} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{quitando?"Retirando…":"Confirmar retiro"}</button></div></div>}</article>})}</section>
  </main>;
}
