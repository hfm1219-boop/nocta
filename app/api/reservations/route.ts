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
  const token=`RSV-${crypto.randomUUID().replaceAll("-","").slice(0,18).toUpperCase()}`;
  const {data,error}=await supabase.rpc("create_event_reservation",{event_key:body.eventKey,party_size_value:body.partySize,customer_name_value:body.customerName.trim(),customer_email_value:body.email?.trim()??"",phone_value:body.phone.trim(),zone_name_value:body.zoneName??"",deposit_cop_value:body.depositCop??0,notes_value:body.notes??"",access_token_hash_value:await hashToken(token)});
  if(error){const status=error.message.includes("CAPACITY_REACHED")||error.message.includes("EVENT_UNAVAILABLE")?409:400;return NextResponse.json({error:error.message.includes("CAPACITY_REACHED")?"El evento no tiene aforo suficiente para esta reserva":error.message.includes("EVENT_UNAVAILABLE")?"Evento no disponible o ya finalizado":error.message},{status});}return NextResponse.json({id:data,token},{status:201});
}

export async function PATCH(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)return NextResponse.json({error:"No autenticado"},{status:401});
  const body=await request.json() as {id?:string;status?:"confirmed"|"cancelled"|"completed"};if(!body.id||!body.status)return NextResponse.json({error:"Actualización inválida"},{status:400});
  const{data:reservation}=await supabase.from("reservations").select("customer_user_id,venue_id").eq("id",body.id).maybeSingle();if(!reservation)return NextResponse.json({error:"Reserva no encontrada"},{status:404});const own=reservation.customer_user_id===claims.claims.sub;if(body.status==="cancelled"&&own){const{data,error}=await supabase.rpc("cancel_own_reservation",{reservation_id:body.id});if(error)return NextResponse.json({error:error.message},{status:403});return data?NextResponse.json({ok:true}):NextResponse.json({error:"La reserva ya no puede cancelarse"},{status:409});}const{data:operator}=await supabase.rpc("can_operate_venue",{target_venue:reservation.venue_id});if(!operator)return NextResponse.json({error:"No tienes permiso para cambiar este estado"},{status:403});
  const {data,error}=await supabase.from("reservations").update({status:body.status,updated_at:new Date().toISOString()}).eq("id",body.id).select("id").maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:403});return data?NextResponse.json({ok:true}):NextResponse.json({error:"La reserva cambió o ya no está disponible"},{status:409});
}
