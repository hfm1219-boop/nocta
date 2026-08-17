"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CollaborationCenter } from "@/components/collaboration-center";
import { type ActiveVenue, useActiveVenue } from "@/lib/active-venue";

type Solicitud={id:string;venue_id:string;status:string;notes?:string;events?:{name?:string;starts_at?:string;capacity?:number};venues?:{id?:string;name?:string;city?:string}};
const ESTADOS:Record<string,string>={requested:"Pendiente",approved:"Aprobado y publicado",rejected:"Rechazado",cancelled:"Cancelado"};

export default function SolicitudesEventos(){
  const[items,setItems]=useState<Solicitud[]>([]);const[venues,setVenues]=useState<ActiveVenue[]>([]);const[error,setError]=useState("");
  const{activeVenue}=useActiveVenue(venues);
  async function cargar(){const[r,venueResponse]=await Promise.all([fetch("/api/event-collaborations",{cache:"no-store"}),fetch("/api/establishment",{cache:"no-store"})]);const[d,venueData]=await Promise.all([r.json(),venueResponse.json()]);if(r.ok)setItems(d.requests??[]);else setError(d.error??"No fue posible cargar");if(venueResponse.ok)setVenues(venueData.venues??[])}
  useEffect(()=>{let activo=true;void Promise.all([fetch("/api/event-collaborations",{cache:"no-store"}),fetch("/api/establishment",{cache:"no-store"})]).then(async([r,venueResponse])=>{const[d,venueData]=await Promise.all([r.json(),venueResponse.json()]);if(!activo)return;if(r.ok)setItems(d.requests??[]);else setError(d.error??"No fue posible cargar");if(venueResponse.ok)setVenues(venueData.venues??[])});return()=>{activo=false}},[]);
  async function decidir(id:string,status:"approved"|"rejected"){const r=await fetch("/api/event-collaborations",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});if(r.ok)await cargar();else setError("No fue posible guardar la decisión")}
  const visible=items.filter(item=>item.venue_id===activeVenue?.id);
  return <main className="flex-1 px-5 py-8 max-w-4xl mx-auto space-y-8"><header className="card border-neon2/30 p-5"><Link href="/admin" className="text-sm text-muted">← Administración</Link><h1 className="text-3xl font-bold mt-3">Solicitudes de eventos</h1>{activeVenue&&<p className="mt-3 font-semibold text-neon2">● Sede activa: {activeVenue.name} · {activeVenue.city}</p>}<p className="text-muted mt-2">Solo se muestran solicitudes de la sede activa. Al aprobar, el evento se publica y Conecta abre automáticamente sus registros.</p></header>{error&&<p className="text-danger">{error}</p>}<section className="space-y-3">{visible.map(s=><article key={s.id} className="card p-5"><div className="flex justify-between gap-4"><div><p className="text-xs text-neon3">{s.venues?.name} · {ESTADOS[s.status]??s.status}</p><h2 className="text-xl font-bold">{s.events?.name}</h2><p className="text-sm text-muted">{s.events?.starts_at?new Date(s.events.starts_at).toLocaleString("es-CO"):""} · capacidad {s.events?.capacity}</p></div>{s.status==="requested"&&<div className="flex gap-2 self-start"><button onClick={()=>decidir(s.id,"rejected")} className="rounded-xl border border-danger/40 p-3 text-danger">Rechazar</button><button onClick={()=>decidir(s.id,"approved")} className="btn-neon rounded-xl p-3">Aprobar y publicar</button></div>}</div></article>)}{!visible.length&&<p className="card p-8 text-center text-muted">No hay solicitudes para esta sede.</p>}</section><CollaborationCenter/></main>;
}
