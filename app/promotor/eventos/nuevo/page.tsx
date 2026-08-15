"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LUGARES } from "@/lib/discovery";
import { crearExperiencia, type ModoMatching, type TipoExperiencia } from "@/lib/social-events";

export default function NuevaExperiencia() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<TipoExperiencia>("social");
  const [lugarId, setLugarId] = useState(LUGARES[0].id);
  const [lugarExterno, setLugarExterno] = useState(false);
  const [lugarNombre, setLugarNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("Cartagena");
  const [fecha, setFecha] = useState("2026-08-29T20:00");
  const [capacidad, setCapacidad] = useState(40);
  const [revelacion, setRevelacion] = useState("21:30");
  const [promotor, setPromotor] = useState("");
  const [modoMatching, setModoMatching] = useState<ModoMatching>("one-to-one");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const lugar = LUGARES.find((item) => item.id === lugarId)!;

  async function crear() {
    if (!nombre.trim() || !promotor.trim() || (lugarExterno && !lugarNombre.trim())) return;
    setGuardando(true); setError("");
    const respuesta = await fetch("/api/conecta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nombre, description: descripcion, type: tipo, matchingMode: modoMatching, capacity: capacidad, startsAt: new Date(fecha).toISOString(), revealAt: revelacion, venueExternalKey: lugarExterno ? undefined : lugarId }) });
    const remoto = await respuesta.json(); setGuardando(false);
    if (!respuesta.ok) return setError(remoto.error ?? "No fue posible crear Conecta.");
    const evento = crearExperiencia({ nombre, descripcion, tipo, lugarId: lugarExterno ? `externo-${Date.now()}` : lugarId, lugarNombre: lugarExterno ? lugarNombre : lugar.nombre, direccion: lugarExterno ? direccion : undefined, ciudad: lugarExterno ? ciudad : undefined, fechaISO: new Date(fecha).toISOString(), capacidad, modoMatching, horaRevelacion: revelacion, promotor }, remoto.externalKey);
    router.push(`/promotor/eventos/${evento.id}`);
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-lg mx-auto w-full space-y-6">
      <button onClick={() => router.back()} className="text-sm text-muted">← Panel del promotor</button>
      <header><p className="text-xs uppercase tracking-wider text-neon3">Nueva experiencia</p><h1 className="text-3xl font-bold mt-1">Crea un evento social</h1></header>
      <section className="card p-5 space-y-4">
        <Campo titulo="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} className="entrada" placeholder="Cartagena Social Match Night" /></Campo>
        <Campo titulo="Descripción"><textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="entrada min-h-24" /></Campo>
        <Campo titulo="Promotor o comunidad"><input value={promotor} onChange={(e) => setPromotor(e.target.value)} className="entrada" /></Campo>
        <Campo titulo="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value as TipoExperiencia)} className="entrada"><option value="dating">Dating</option><option value="networking">Networking</option><option value="social">Social mixto</option><option value="community">Comunidad privada</option></select></Campo>
        <Campo titulo="Lugar"><div className="flex gap-2 mb-2"><button onClick={() => setLugarExterno(false)} className={`rounded-full px-3 py-2 ${!lugarExterno ? "chip-active" : "border border-line"}`}>Lugar NOCTA</button><button onClick={() => setLugarExterno(true)} className={`rounded-full px-3 py-2 ${lugarExterno ? "chip-active" : "border border-line"}`}>Otro lugar</button></div>{lugarExterno ? <div className="space-y-2"><input value={lugarNombre} onChange={(e) => setLugarNombre(e.target.value)} className="entrada" placeholder="Nombre del lugar"/><input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="entrada" placeholder="Dirección"/><input value={ciudad} onChange={(e) => setCiudad(e.target.value)} className="entrada" placeholder="Ciudad"/></div> : <select value={lugarId} onChange={(e) => setLugarId(e.target.value)} className="entrada">{LUGARES.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>}</Campo>
        <div className="grid grid-cols-2 gap-3"><Campo titulo="Fecha y hora"><input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="entrada" /></Campo><Campo titulo="Capacidad"><input type="number" min={4} value={capacidad} onChange={(e) => setCapacidad(Number(e.target.value))} className="entrada" /></Campo></div>
        <Campo titulo="Modo de matching"><select value={modoMatching} onChange={(e) => setModoMatching(e.target.value as ModoMatching)} className="entrada"><option value="one-to-one">Uno a uno · una conexión principal</option><option value="groups">Grupos · mesas de 3 a 4 personas</option><option value="rounds">Rondas · hasta 3 conversaciones rotativas</option></select></Campo>
        <Campo titulo="Hora de revelación"><input type="time" value={revelacion} onChange={(e) => setRevelacion(e.target.value)} className="entrada" /></Campo>
      </section>
      {error&&<p className="text-sm text-danger">{error}</p>}<button onClick={crear} disabled={guardando || !nombre.trim() || !promotor.trim() || (lugarExterno && !lugarNombre.trim())} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-40">{guardando ? "Creando…" : "Crear y publicar experiencia"}</button>
    </main>
  );
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="text-muted text-xs">{titulo}</span>{children}</label>; }
