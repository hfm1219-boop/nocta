import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function POST(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(!userId)return NextResponse.json({error:"Inicia sesión para solicitar una reserva."},{status:401});
  const body=await request.json() as {eventKey?:string;partySize?:number;customerName?:string;phone?:string;zoneName?:string;depositCop?:number;notes?:string};
  if(!body.eventKey||!body.partySize||body.partySize<1||!body.customerName?.trim()||!body.phone?.trim())return NextResponse.json({error:"Reserva inválida"},{status:400});
  const {data:event}=await supabase.from("events").select("id,starts_at").eq("external_key",body.eventKey).single();if(!event)return NextResponse.json({error:"Evento no disponible"},{status:404});
  const {data:collaboration}=await supabase.from("event_venue_collaborations").select("venue_id").eq("event_id",event.id).eq("status","approved").limit(1).maybeSingle();if(!collaboration)return NextResponse.json({error:"El evento no tiene una sede aprobada"},{status:409});
  const {data,error}=await supabase.from("reservations").insert({event_id:event.id,venue_id:collaboration.venue_id,customer_user_id:userId,customer_name:body.customerName.trim(),phone:body.phone.trim(),party_size:body.partySize,zone_name:body.zoneName,reserved_for:event.starts_at,deposit_cop:body.depositCop??0,status:"pending",notes:body.notes??""}).select("id").single();
  if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({id:data.id},{status:201});
}

