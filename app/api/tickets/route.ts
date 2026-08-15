import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  const supabase=await crearClienteSupabaseServidor(); if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims(); const userId=claims?.claims?.sub;if(!userId)return NextResponse.json({error:"Inicia sesión para comprar entradas."},{status:401});
  const body=await request.json() as {eventKey?:string;typeName?:string;quantity?:number;holderName?:string;holderEmail?:string};
  if(!body.eventKey||!body.typeName||!body.quantity||body.quantity<1||body.quantity>4||!body.holderName?.trim()||!body.holderEmail?.includes("@"))return NextResponse.json({error:"Compra inválida"},{status:400});
  const {data:event}=await supabase.from("events").select("id").eq("external_key",body.eventKey).single();if(!event)return NextResponse.json({error:"Evento no disponible"},{status:404});
  const {data:type}=await supabase.from("ticket_types").select("id,event_id,price_cop,capacity").eq("event_id",event.id).eq("name",body.typeName).eq("active",true).single();if(!type)return NextResponse.json({error:"Localidad no disponible"},{status:404});
  const {count}=await supabase.from("tickets").select("id",{count:"exact",head:true}).eq("ticket_type_id",type.id).in("status",["reserved","paid","used"]);if((count??0)+body.quantity>type.capacity)return NextResponse.json({error:"No quedan suficientes entradas."},{status:409});
  const rawTokens=Array.from({length:body.quantity},()=>crypto.randomUUID().replaceAll("-","").toUpperCase());
  const rows=await Promise.all(rawTokens.map(async token=>({ticket_type_id:type.id,event_id:event.id,holder_user_id:userId,holder_name:body.holderName!.trim(),holder_email:body.holderEmail!.trim(),qr_token_hash:await hashToken(token),status:"paid",amount_cop:type.price_cop,purchased_at:new Date().toISOString()})));
  const {data,error}=await supabase.from("tickets").insert(rows).select("id");if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({tickets:data?.map((ticket,index)=>({id:ticket.id,token:rawTokens[index]}))},{status:201});
}

