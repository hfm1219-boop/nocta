import { NextRequest,NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";
const TYPES=new Set(["venue_impression","venue_view","venue_click","event_impression","event_view","event_click","promotion_impression","promotion_view","promotion_click","reservation_started","ticket_checkout_started","venue_checkin"]);
export async function GET(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"No autorizado"},{status:401});
  const venueKey=request.nextUrl.searchParams.get("venueKey");if(!venueKey)return NextResponse.json({error:"Establecimiento requerido"},{status:400});
  const{data:venue}=await supabase.from("venues").select("id").eq("external_key",venueKey).eq("active",true).maybeSingle();
  if(!venue)return NextResponse.json({error:"Establecimiento no encontrado"},{status:404});
  const{data:allowed}=await supabase.rpc("can_operate_venue",{target_venue:venue.id});if(!allowed)return NextResponse.json({error:"Sin permisos"},{status:403});
  const{data,error}=await supabase.from("consumer_events").select("id,user_id,occurred_at,metadata,profiles!consumer_events_user_id_fkey(full_name)").eq("venue_id",venue.id).eq("event_type","venue_checkin").eq("source","web").order("occurred_at",{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:"No fue posible consultar las visitas"},{status:400});
  const visits=(data??[]).filter(item=>(item.metadata as Record<string,unknown>|null)?.verified!==true);
  return NextResponse.json({visits});
}
export async function PATCH(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"No autorizado"},{status:401});
  const body=await request.json().catch(()=>null)as{eventId?:unknown}|null,eventId=Number(body?.eventId);
  if(!Number.isSafeInteger(eventId)||eventId<=0)return NextResponse.json({error:"Visita inválida"},{status:400});
  const{data,error}=await supabase.rpc("verify_consumer_venue_checkin",{target_event:eventId});
  if(error)return NextResponse.json({error:error.message.includes("FORBIDDEN")?"Sin permisos":"No fue posible verificar la visita"},{status:error.message.includes("FORBIDDEN")?403:400});
  return data?NextResponse.json({verified:true}):NextResponse.json({error:"Visita no encontrada"},{status:404});
}
export async function POST(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const body=await request.json().catch(()=>null)as Record<string,unknown>|null;
  if(!body||typeof body.eventType!=="string"||!TYPES.has(body.eventType)||typeof body.sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.sessionId))return NextResponse.json({error:"Evento inválido"},{status:400});
  const entityType=typeof body.entityType==="string"?body.entityType:null,entityKey=typeof body.entityKey==="string"?body.entityKey:null;
  if(entityType&&!['venue','event','promotion'].includes(entityType)||entityKey&&entityKey.length>160)return NextResponse.json({error:"Entidad inválida"},{status:400});
  const{error}=await supabase.rpc("track_consumer_event",{requested_type:body.eventType,requested_session:body.sessionId,entity_type:entityType,entity_key:entityKey,requested_source:"web",requested_device:typeof body.device==="string"?body.device:"unknown",requested_path:typeof body.path==="string"?body.path:null,requested_metadata:{},requested_dedup_key:typeof body.dedupKey==="string"?body.dedupKey.slice(0,300):null});
  return error?NextResponse.json({error:error.message.includes("RATE_LIMITED")?"Demasiados eventos. Intenta nuevamente en un minuto.":"No fue posible registrar el evento"},{status:error.message.includes("RATE_LIMITED")?429:400}):new NextResponse(null,{status:204});
}
