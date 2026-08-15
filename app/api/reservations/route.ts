import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

async function hashToken(token:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}

export async function GET(){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)return NextResponse.json({error:"No autenticado"},{status:401});
  const {data,error}=await supabase.from("reservations").select("id,customer_name,customer_email,phone,party_size,zone_name,reserved_for,deposit_cop,status,notes,created_at,updated_at,events(external_key),venues(external_key)").order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:403});return NextResponse.json({reservations:data??[]});
}

export async function POST(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(!userId)return NextResponse.json({error:"Inicia sesión para solicitar una reserva."},{status:401});
  const body=await request.json() as {eventKey?:string;partySize?:number;customerName?:string;phone?:string;email?:string;zoneName?:string;depositCop?:number;notes?:string};
  if(!body.eventKey||!body.partySize||body.partySize<1||!body.customerName?.trim()||!body.phone?.trim())return NextResponse.json({error:"Reserva inválida"},{status:400});
  const {data:event}=await supabase.from("events").select("id,starts_at").eq("external_key",body.eventKey).single();if(!event)return NextResponse.json({error:"Evento no disponible"},{status:404});
  const {data:collaboration}=await supabase.from("event_venue_collaborations").select("venue_id").eq("event_id",event.id).eq("status","approved").limit(1).maybeSingle();if(!collaboration)return NextResponse.json({error:"El evento no tiene una sede aprobada"},{status:409});
  const token=`RSV-${crypto.randomUUID().replaceAll("-","").slice(0,18).toUpperCase()}`;
  const {data,error}=await supabase.from("reservations").insert({event_id:event.id,venue_id:collaboration.venue_id,customer_user_id:userId,customer_name:body.customerName.trim(),customer_email:body.email?.trim()||null,phone:body.phone.trim(),party_size:body.partySize,zone_name:body.zoneName,reserved_for:event.starts_at,deposit_cop:body.depositCop??0,status:"pending",notes:body.notes??"",access_token_hash:await hashToken(token)}).select("id").single();
  if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({id:data.id,token},{status:201});
}

export async function PATCH(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)return NextResponse.json({error:"No autenticado"},{status:401});
  const body=await request.json() as {id?:string;status?:"confirmed"|"cancelled"|"completed"};if(!body.id||!body.status)return NextResponse.json({error:"Actualización inválida"},{status:400});
  const {error}=await supabase.from("reservations").update({status:body.status,updated_at:new Date().toISOString()}).eq("id",body.id);
  if(error)return NextResponse.json({error:error.message},{status:403});return NextResponse.json({ok:true});
}
