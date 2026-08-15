import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

type Participant = { id: string; questionnaire: Record<string, unknown>; intention: string | null };

function score(a: Participant, b: Participant) {
  const aq = a.questionnaire; const bq = b.questionnaire;
  const ai = Array.isArray(aq.interests) ? aq.interests as string[] : [];
  const bi = Array.isArray(bq.interests) ? bq.interests as string[] : [];
  let value = 48 + ai.filter((item) => bi.includes(item)).length * 10;
  if (aq.convType === bq.convType) value += 8;
  if (aq.energy === bq.energy) value += 5;
  if (a.intention === b.intention) value += 8;
  for (const field of ["ambition", "wellness"] as const) value += Math.max(0, 5 - Math.abs(Number(aq[field] ?? 3) - Number(bq[field] ?? 3)) * 2);
  value -= Math.min(8, Math.abs(Number(aq.openness ?? 3) - Number(bq.openness ?? 3)) * 2);
  return Math.max(40, Math.min(97, value));
}

function average(ids: string[], people: Participant[]) {
  const values: number[] = [];
  ids.forEach((id, index) => ids.slice(index + 1).forEach((other) => values.push(score(people.find((p) => p.id === id)!, people.find((p) => p.id === other)!))));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function buildAssignments(mode: string, people: Participant[]) {
  const rows: { mode: string; round_number: number; participant_ids: string[]; compatibility: number }[] = [];
  if (mode === "groups") {
    const pending = [...people]; const groupCount = people.length < 3 ? 0 : Math.ceil(people.length / 4);
    const sizes = groupCount ? Array.from({ length: groupCount }, (_, i) => Math.floor(people.length / groupCount) + (i < people.length % groupCount ? 1 : 0)) : [];
    while (pending.length && sizes.length) {
      const group = [pending.shift()!.id]; const size = sizes.shift()!;
      while (group.length < size && pending.length) {
        let best = 0; let bestScore = -1;
        pending.forEach((candidate, index) => { const candidateScore = group.reduce((sum, id) => sum + score(people.find((p) => p.id === id)!, candidate), 0); if (candidateScore > bestScore) { best = index; bestScore = candidateScore; } });
        group.push(pending.splice(best, 1)[0].id);
      }
      rows.push({ mode, round_number: 1, participant_ids: group, compatibility: average(group, people) });
    }
  } else if (mode === "rounds") {
    const ids: Array<string | null> = people.map((p) => p.id); if (ids.length % 2) ids.push(null);
    for (let round = 1; round <= Math.min(3, ids.length - 1); round += 1) {
      for (let i = 0; i < ids.length / 2; i += 1) { const a = ids[i]; const b = ids[ids.length - 1 - i]; if (a && b) rows.push({ mode, round_number: round, participant_ids: [a, b], compatibility: average([a, b], people) }); }
      ids.splice(1, 0, ids.pop()!);
    }
  } else {
    const pending = [...people];
    while (pending.length > 1) {
      const first = pending.shift()!; let best = 0; let bestScore = -1;
      pending.forEach((candidate, index) => { const value = score(first, candidate); if (value > bestScore) { best = index; bestScore = value; } });
      rows.push({ mode: "one-to-one", round_number: 1, participant_ids: [first.id, pending.splice(best, 1)[0].id], compatibility: bestScore });
    }
  }
  return rows;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params; const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: module, error } = await supabase.from("conecta_modules").select("id,external_key,event_id,name,description,experience_type,matching_mode,capacity,reveal_at,status,owner_promoter_id,created_at").eq("external_key", key).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!module) return NextResponse.json({ error: "Experiencia no encontrada" }, { status: 404 });
  const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims?.sub;
  const owner = userId === module.owner_promoter_id;
  const [{ data: event }, { data: participants }, { data: assignments }, { data: interactions }, { data: reports }, { data: peers }] = await Promise.all([
    supabase.from("events").select("starts_at").eq("id", module.event_id).maybeSingle(),
    userId ? supabase.from("conecta_participants").select("id,display_name,age,gender,intention,consented_at,questionnaire,questionnaire_completed_at,checked_in_at,feedback,created_at").eq("conecta_id", module.id).order("created_at") : Promise.resolve({ data: [] }),
    userId ? supabase.from("conecta_assignments").select("id,mode,round_number,participant_ids,compatibility,created_at").eq("conecta_id", module.id) : Promise.resolve({ data: [] }),
    userId ? supabase.from("conecta_interactions").select("id,kind,from_participant_id,to_participant_id,status,created_at,updated_at").eq("conecta_id", module.id) : Promise.resolve({ data: [] }),
    owner ? supabase.from("conecta_reports").select("id,reporter_participant_id,reported_participant_id,reason,detail,status,created_at").eq("conecta_id", module.id) : Promise.resolve({ data: [] }),
    userId && !owner ? supabase.rpc("conecta_visible_peers", { module_key: key }) : Promise.resolve({ data: [] }),
  ]);
  return NextResponse.json({ module: { ...module, starts_at: event?.starts_at }, owner, participants: participants ?? [], peers: peers ?? [], assignments: assignments ?? [], interactions: interactions ?? [], reports: reports ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params; const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>; const action = String(body.action ?? "");
  let result: { error: { message: string } | null } = { error: null };
  if (action === "register") {
    result = await supabase.rpc("register_conecta_participant", { module_key: key, participant_name: body.name, participant_phone: body.phone, participant_age: body.age, participant_gender: body.gender, participant_intention: body.intention, accepted_consent: body.consent });
  } else if (["questionnaire", "checkin", "feedback"].includes(action)) {
    result = await supabase.rpc("update_my_conecta_participation", { module_key: key, requested_action: action, action_payload: body.payload ?? {} });
  } else if (action === "state") {
    result = await supabase.rpc("manage_conecta_state", { module_key: key, next_status: body.status });
  } else if (action === "matching") {
    const { data: module } = await supabase.from("conecta_modules").select("id,matching_mode,owner_promoter_id").eq("external_key", key).maybeSingle();
    if (!module || module.owner_promoter_id !== userId) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    const { data: people, error } = await supabase.from("conecta_participants").select("id,questionnaire,intention").eq("conecta_id", module.id).not("questionnaire_completed_at", "is", null).not("checked_in_at", "is", null);
    if (error) result = { error }; else {
      const rows = buildAssignments(module.matching_mode, (people ?? []) as Participant[]).map((row) => ({ ...row, conecta_id: module.id }));
      if (!rows.length) return NextResponse.json({ error: "No hay suficientes asistentes con encuesta y check-in" }, { status: 400 });
      const deleted = await supabase.from("conecta_assignments").delete().eq("conecta_id", module.id);
      result = deleted.error ? deleted : await supabase.from("conecta_assignments").insert(rows);
      if (!result.error) result = await supabase.rpc("manage_conecta_state", { module_key: key, next_status: "matching" });
    }
  } else if (action === "interaction") {
    result = await supabase.rpc("interact_conecta", { module_key: key, requested_action: body.kind, target_id: body.toId });
  } else if (action === "interaction-response") {
    result = await supabase.rpc("interact_conecta", { module_key: key, requested_action: body.accept ? "accept-contact" : "reject-contact", target_id: body.interactionId });
  } else if (action === "report") {
    result = await supabase.rpc("report_conecta", { module_key: key, reported_id: body.reportedId || null, report_reason: body.reason, report_detail: body.detail ?? "" });
  } else if (action === "report-state") {
    result = await supabase.rpc("manage_conecta_report", { report_id: body.reportId, next_status: body.status });
  } else return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
