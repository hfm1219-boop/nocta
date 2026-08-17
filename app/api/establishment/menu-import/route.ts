import { NextRequest, NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

type Row={id?:string;nombre?:string;categoria?:string;descripcion?:string;precio?:number;disponible?:boolean;imagenUrl?:string};

export async function POST(request:NextRequest){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const{data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)return NextResponse.json({error:"No autenticado"},{status:401});
  const{data:access,error:accessError}=await supabase.rpc("get_my_access_context");const active=access?.activeContext as{organizationId?:string;role?:string}|undefined;
  if(accessError||active?.role!=="establishment"||!active.organizationId)return NextResponse.json({error:"Selecciona un contexto de establecimiento"},{status:403});
  const body=await request.json() as{venueId?:string;type?:"precios"|"productos";rows?:Row[]};if(!body.venueId||!body.type||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500)return NextResponse.json({error:"Plantilla inválida"},{status:400});
  const{data:venue}=await supabase.from("venues").select("id").eq("id",body.venueId).eq("organization_id",active.organizationId).maybeSingle();if(!venue)return NextResponse.json({error:"La sede no pertenece al contexto activo"},{status:403});
  if(body.type==="precios"){
    let applied=0;for(const row of body.rows){if(!row.id||!Number.isFinite(row.precio)||Number(row.precio)<=0)return NextResponse.json({error:"Hay filas de precios inválidas"},{status:400});const{data,error}=await supabase.from("venue_menu_items").update({price_cop:Number(row.precio),available:Boolean(row.disponible),updated_at:new Date().toISOString()}).eq("id",row.id).eq("venue_id",body.venueId).select("id").maybeSingle();if(error)return NextResponse.json({error:error.message},{status:400});if(!data)return NextResponse.json({error:`Producto no encontrado: ${row.id}`},{status:404});applied++}return NextResponse.json({ok:true,applied});
  }
  const{data:existing,error:categoryError}=await supabase.from("venue_menu_categories").select("id,name").eq("venue_id",body.venueId);if(categoryError)return NextResponse.json({error:categoryError.message},{status:400});
  const categoryMap=new Map((existing??[]).map(item=>[item.name.trim().toLowerCase(),item.id]));let applied=0;
  for(const row of body.rows){const name=String(row.nombre??"").trim();const categoryName=String(row.categoria??"").trim().toLowerCase();if(name.length<2||!categoryName||!Number.isFinite(row.precio)||Number(row.precio)<=0)return NextResponse.json({error:"Hay productos nuevos inválidos"},{status:400});let categoryId=categoryMap.get(categoryName);if(!categoryId){const{data,error}=await supabase.from("venue_menu_categories").insert({venue_id:body.venueId,name:categoryName.charAt(0).toUpperCase()+categoryName.slice(1),sort_order:categoryMap.size}).select("id").single();if(error)return NextResponse.json({error:error.message},{status:400});categoryId=data.id;categoryMap.set(categoryName,categoryId)}const{error}=await supabase.from("venue_menu_items").insert({venue_id:body.venueId,category_id:categoryId,name,description:String(row.descripcion??""),sku:row.id||null,price_cop:Number(row.precio),available:Boolean(row.disponible),image_url:row.imagenUrl||null});if(error)return NextResponse.json({error:error.message},{status:400});applied++}
  return NextResponse.json({ok:true,applied},{status:201});
}
