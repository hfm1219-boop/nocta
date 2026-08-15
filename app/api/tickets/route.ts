import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

export async function GET(){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)return NextResponse.json({error:"No autenticado"},{status:401});
  const {data,error}=await supabase.from("tickets").select("id,qr_token,status,holder_name,holder_email,amount_cop,purchased_at,used_at,ticket_types(id,name),events(external_key)").eq("holder_user_id",claims.claims.sub).order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:403});return NextResponse.json({tickets:data??[]});
}

export async function POST(request: NextRequest) {
  const supabase=await crearClienteSupabaseServidor(); if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims(); const userId=claims?.claims?.sub;if(!userId)return NextResponse.json({error:"Inicia sesión para comprar entradas."},{status:401});
  const body=await request.json() as {eventKey?:string;typeName?:string;quantity?:number;holderName?:string;holderEmail?:string};
  if(!body.eventKey||!body.typeName||!body.quantity||body.quantity<1||body.quantity>4||!body.holderName?.trim()||!body.holderEmail?.includes("@"))return NextResponse.json({error:"Compra inválida"},{status:400});
  const {data,error}=await supabase.rpc("purchase_tickets",{event_key:body.eventKey,type_name:body.typeName,quantity:body.quantity,holder_name:body.holderName.trim(),holder_email:body.holderEmail.trim()});
  if(error){const agotado=error.message.includes("No quedan");return NextResponse.json({error:error.message},{status:agotado?409:400});}
  return NextResponse.json({tickets:data},{status:201});
}
