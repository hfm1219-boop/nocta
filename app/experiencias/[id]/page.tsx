"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  confirmarCheckin, enviarFeedback, guardarCuestionario, PREGUNTAS_AFINIDAD,
  registrarParticipante, useExperienciasSociales, useIdParticipanteActual,
  type RespuestasAfinidad,
} from "@/lib/social-events";

export default function ExperienciaAsistente() {
  const { id } = useParams<{ id: string }>();
  const evento = useExperienciasSociales().find((item) => item.id === id);
  const participanteId = useIdParticipanteActual(id);
  const participante = evento?.participantes.find((item) => item.id === participanteId);
  if (!evento) return <main className="p-8 text-muted">Experiencia no encontrada.</main>;
  if (!participante) return <Registro eventoId={id} evento={evento} />;
  if (!participante.cuestionarioCompleto) return <Cuestionario eventoId={id} participanteId={participante.id} />;
  if (evento.estado === "revealed" && participante.matchId) {
    const match = evento.participantes.find((item) => item.id === participante.matchId);
    if (match) return <Revelacion eventoId={id} participante={participante} match={match} />;
  }
  return <Espera evento={evento} participante={participante} />;
}

function Registro({ eventoId, evento }: { eventoId: string; evento: NonNullable<ReturnType<typeof useExperienciasSociales>[number]> }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [edad, setEdad] = useState("");
  const [genero, setGenero] = useState("");
  const [intencion, setIntencion] = useState("");
  const [consentimiento, setConsentimiento] = useState(false);
  const abierto = evento.estado === "open" && evento.participantes.length < evento.capacidad;
  function continuar() {
    if (!abierto || !nombre.trim() || !telefono.trim() || Number(edad) < 18 || !intencion || !consentimiento) return;
    registrarParticipante(eventoId, { nombre, telefono, edad: Number(edad), genero, intencion, consentimiento });
  }
  return (
    <main className="flex-1 px-5 py-8 max-w-lg mx-auto w-full space-y-7">
      <Link href="/" className="text-sm text-muted">← Explorar</Link>
      <header className="text-center"><p className="text-xs uppercase tracking-[0.2em] text-neon3">{evento.promotor}</p><h1 className="text-4xl font-bold mt-3">{evento.nombre}</h1><p className="text-muted mt-3">{evento.descripcion}</p><div className="card p-4 mt-5 text-sm"><p>{new Date(evento.fechaISO).toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" })}</p><p className="text-muted mt-1">{evento.lugarNombre} · {evento.participantes.length} confirmados</p></div></header>
      <section className="card p-5 space-y-4"><h2 className="text-xl font-bold">Tu perfil del evento</h2><input value={nombre} onChange={(e) => setNombre(e.target.value)} className="entrada" placeholder="Nombre completo" /><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="entrada" placeholder="WhatsApp" /><div className="grid grid-cols-2 gap-3"><input type="number" min={18} value={edad} onChange={(e) => setEdad(e.target.value)} className="entrada" placeholder="Edad" /><select value={genero} onChange={(e) => setGenero(e.target.value)} className="entrada"><option value="">Género</option><option>Mujer</option><option>Hombre</option><option>No binario</option><option>Prefiero no decir</option></select></div><div><p className="text-xs text-muted mb-2">¿Qué buscas?</p><div className="grid grid-cols-2 gap-2">{["Conocer pareja", "Networking profesional", "Nuevas amistades", "Ampliar mi comunidad"].map((item) => <button key={item} onClick={() => setIntencion(item)} className={`rounded-xl border p-3 text-sm ${intencion === item ? "chip-active bg-neon2/10" : "border-line text-muted"}`}>{item}</button>)}</div></div><label className="flex items-start gap-3 text-sm text-muted"><input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} className="mt-1" /><span>Acepto el uso de mis respuestas exclusivamente para el matching y la operación de esta experiencia.</span></label></section>
      <button onClick={continuar} disabled={!abierto || !nombre.trim() || !telefono.trim() || Number(edad) < 18 || !intencion || !consentimiento} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-40">Continuar al cuestionario</button>
      {!abierto && <p className="text-center text-amber text-sm">El registro está cerrado o alcanzó su capacidad.</p>}
    </main>
  );
}

function Cuestionario({ eventoId, participanteId }: { eventoId: string; participanteId: string }) {
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<RespuestasAfinidad>({});
  const pregunta = PREGUNTAS_AFINIDAD[paso];
  const valor = respuestas[pregunta.id as keyof RespuestasAfinidad];
  function elegir(nuevo: string | number) {
    if (pregunta.type === "multi") {
      const actual = (respuestas.interests ?? []);
      const siguiente = actual.includes(String(nuevo)) ? actual.filter((item) => item !== nuevo) : actual.length < 3 ? [...actual, String(nuevo)] : actual;
      setRespuestas((prev) => ({ ...prev, interests: siguiente }));
    } else setRespuestas((prev) => ({ ...prev, [pregunta.id]: nuevo }));
  }
  const respondida = Array.isArray(valor) ? valor.length > 0 : valor !== undefined;
  function siguiente() { if (!respondida) return; if (paso < PREGUNTAS_AFINIDAD.length - 1) setPaso((n) => n + 1); else guardarCuestionario(eventoId, participanteId, respuestas); }
  return (
    <main className="flex-1 px-5 py-10 max-w-md mx-auto w-full space-y-7">
      <header><div className="flex justify-between text-xs text-muted mb-2"><button onClick={() => paso && setPaso((n) => n - 1)}>← Atrás</button><span>{paso + 1} de {PREGUNTAS_AFINIDAD.length}</span></div><div className="h-1 bg-surface2 rounded-full overflow-hidden"><div className="h-full bg-neon2" style={{ width: `${((paso + 1) / PREGUNTAS_AFINIDAD.length) * 100}%` }} /></div></header>
      <section><h1 className="text-3xl font-bold leading-tight">{pregunta.text}</h1>{pregunta.type === "multi" && <p className="text-sm text-muted mt-2">Selecciona hasta tres.</p>}</section>
      {pregunta.type === "scale" ? <div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => elegir(n)} className={`aspect-square rounded-xl border text-lg font-bold ${valor === n ? "chip-active bg-neon2/10" : "border-line text-muted"}`}>{n}</button>)}<span className="col-span-2 text-xs text-muted">{pregunta.labels[0]}</span><span className="col-span-3 text-xs text-muted text-right">{pregunta.labels[1]}</span></div> : <div className="space-y-2">{pregunta.options.map((opcion) => { const activa = Array.isArray(valor) ? valor.includes(opcion) : valor === opcion; return <button key={opcion} onClick={() => elegir(opcion)} className={`card w-full p-4 text-left ${activa ? "chip-active text-neon3" : "text-muted"}`}>{opcion}{activa && <span className="float-right">✓</span>}</button>; })}</div>}
      <button onClick={siguiente} disabled={!respondida} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-40">{paso === PREGUNTAS_AFINIDAD.length - 1 ? "Finalizar" : "Siguiente"} →</button>
    </main>
  );
}

function Espera({ evento, participante }: { evento: NonNullable<ReturnType<typeof useExperienciasSociales>[number]>; participante: NonNullable<ReturnType<typeof useExperienciasSociales>[number]["participantes"][number]> }) {
  return <main className="flex-1 px-5 py-12 max-w-md mx-auto w-full text-center space-y-6"><div className="text-6xl">✨</div><div><p className="text-neon3 text-sm font-semibold">Perfil completado</p><h1 className="text-3xl font-bold mt-2">Estamos buscando tu conexión</h1><p className="text-muted mt-3">El promotor revelará los matches a las {evento.horaRevelacion}.</p></div><section className="card p-5"><p className="text-xs text-muted">Estado de llegada</p><p className={`font-bold mt-2 ${participante.checkin ? "text-lime" : "text-amber"}`}>{participante.checkin ? "✓ Check-in confirmado" : "Aún no has confirmado tu llegada"}</p>{!participante.checkin && <button onClick={() => confirmarCheckin(evento.id, participante.id)} className="btn-neon w-full rounded-xl p-3 font-semibold mt-4">Ya llegué · Confirmar check-in</button>}</section><p className="text-xs text-muted">Tu información no se muestra a otros participantes antes de la revelación.</p></main>;
}

function Revelacion({ eventoId, participante, match }: { eventoId: string; participante: NonNullable<ReturnType<typeof useExperienciasSociales>[number]["participantes"][number]>; match: NonNullable<ReturnType<typeof useExperienciasSociales>[number]["participantes"][number]> }) {
  const [feedback, setFeedback] = useState(false);
  const [rating, setRating] = useState(0);
  const [volveria, setVolveria] = useState("");
  const [comentario, setComentario] = useState("");
  const compartidos = (participante.respuestas.interests ?? []).filter((item) => (match.respuestas.interests ?? []).includes(item));
  if (participante.feedback) return <main className="flex-1 px-5 py-16 max-w-md mx-auto text-center"><div className="text-6xl">✓</div><h1 className="text-3xl font-bold mt-5">Gracias por tu feedback</h1><p className="text-muted mt-2">Nos ayuda a mejorar las próximas experiencias.</p><Link href="/" className="btn-neon inline-block rounded-full px-6 py-3 mt-8">Volver a NOCTA</Link></main>;
  if (feedback) return <main className="flex-1 px-5 py-10 max-w-md mx-auto w-full space-y-6"><h1 className="text-3xl font-bold">¿Cómo estuvo tu match?</h1><section className="card p-5 text-center"><p className="text-sm text-muted mb-3">Califica la experiencia</p><div className="flex justify-center gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} className={`text-3xl ${n <= rating ? "text-amber" : "text-line"}`}>★</button>)}</div></section><section className="card p-5 space-y-3"><p className="text-sm">¿Volverías a conocer a esta persona?</p>{["Sí", "Tal vez", "No"].map((item) => <button key={item} onClick={() => setVolveria(item)} className={`rounded-xl border px-4 py-3 mr-2 ${volveria === item ? "chip-active" : "border-line text-muted"}`}>{item}</button>)}<textarea value={comentario} onChange={(e) => setComentario(e.target.value)} className="entrada min-h-24" placeholder="Comentario opcional" /></section><button disabled={!rating || !volveria} onClick={() => enviarFeedback(eventoId, participante.id, { rating, volveria, comentario })} className="btn-neon w-full rounded-2xl p-4 font-bold disabled:opacity-40">Enviar feedback</button></main>;
  return <main className="flex-1 px-5 py-10 max-w-md mx-auto w-full space-y-5 text-center"><p className="text-xs uppercase tracking-[0.2em] text-neon3">Tu match de esta noche</p><div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-neon1 to-neon2 flex items-center justify-center text-3xl font-bold">{match.nombre.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div><div><h1 className="text-4xl font-bold">{match.nombre}</h1><p className="text-muted mt-1">{match.edad} años · Presente en el evento</p><span className="inline-block rounded-full bg-neon2/10 text-neon2 px-4 py-2 mt-4 font-bold">♡ {participante.compatibilidad}% compatibilidad</span></div><section className="card p-5 text-left"><p className="text-xs uppercase tracking-wider text-muted">Por qué conectan</p><p className="mt-3">Comparten interés en {compartidos.length ? compartidos.join(", ") : "conocer nuevas perspectivas"}.</p><p className="text-sm text-muted mt-2">Sus respuestas muestran estilos sociales compatibles para iniciar una conversación.</p></section><section className="card p-5 text-left"><p className="text-xs uppercase tracking-wider text-muted">Rompehielos</p><p className="mt-3 border-l-2 border-neon3 pl-3">¿Cuál ha sido el mejor plan que has descubierto recientemente?</p><p className="mt-3 border-l-2 border-neon2 pl-3">Si pudieras repetir un viaje mañana, ¿cuál elegirías?</p></section><button onClick={() => setFeedback(true)} className="btn-neon w-full rounded-2xl p-4 font-bold">Enviar saludo y continuar</button></main>;
}
