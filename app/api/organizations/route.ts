import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_TYPES, ORGANIZATION_ROLES, PRINCIPAL_ROLES } from "@/lib/auth/roles";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

async function client() {
  const supabase = await crearClienteSupabaseServidor();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase no configurado" }, { status: 503 }) };
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  return { supabase };
}

export async function GET() {
  const context = await client(); if (context.error) return context.error;
  const { data, error } = await context.supabase!.rpc("get_my_access_context");
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const context = await client(); if (context.error) return context.error;
  const body = await request.json() as { action?: "create" | "admin_create" | "admin_add_context" | "add_context" | "set_member" | "set_member_by_email"; name?: string; organizationId?: string; context?: string; businessType?: string; userId?: string; userEmail?: string; role?: string; venueId?: string };
  if (!body.context || !PRINCIPAL_ROLES.includes(body.context as never)) return NextResponse.json({ error: "Contexto inválido" }, { status: 400 });
  if (body.businessType && !BUSINESS_TYPES.includes(body.businessType as never)) return NextResponse.json({ error: "Tipo empresarial inválido" }, { status: 400 });
  let result: { data: unknown; error: { message: string } | null };
  if (body.action === "admin_create" && body.name?.trim() && body.userId) result = await context.supabase!.rpc("admin_create_nocta_organization", { organization_name: body.name.trim(), initial_context: body.context, organization_business_type: body.businessType || null, owner_user: body.userId });
  else if (body.action === "admin_add_context" && body.organizationId) result = await context.supabase!.rpc("admin_add_organization_context", { target_organization: body.organizationId, new_context: body.context, organization_business_type: body.businessType || null });
  else if (body.action === "create" && body.name?.trim()) result = await context.supabase!.rpc("create_nocta_organization", { organization_name: body.name.trim(), initial_context: body.context, organization_business_type: body.businessType || null });
  else if (body.action === "add_context" && body.organizationId) result = await context.supabase!.rpc("add_organization_context", { target_organization: body.organizationId, new_context: body.context });
  else if (body.action === "set_member" && body.organizationId && body.userId && body.role && ORGANIZATION_ROLES.includes(body.role as never)) result = await context.supabase!.rpc("set_organization_member_access", { target_organization: body.organizationId, target_user: body.userId, target_context: body.context, target_role: body.role, target_venue: body.venueId || null });
  else if (body.action === "set_member_by_email" && body.organizationId && body.userEmail?.trim() && body.role && ORGANIZATION_ROLES.includes(body.role as never)) result = await context.supabase!.rpc("set_organization_member_access_by_email", { target_organization: body.organizationId, target_email: body.userEmail.trim().toLowerCase(), target_context: body.context, target_role: body.role, target_venue: body.venueId || null });
  else return NextResponse.json({ error: "Operación inválida" }, { status: 400 });
  return result.error ? NextResponse.json({ error: result.error.message }, { status: 403 }) : NextResponse.json({ data: result.data }, { status: 201 });
}

export async function DELETE(request:NextRequest){
  const context=await client();if(context.error)return context.error;
  const body=await request.json() as{organizationId?:string;userId?:string;context?:string;role?:string;venueId?:string};
  if(!body.organizationId||!body.userId||!body.context||!PRINCIPAL_ROLES.includes(body.context as never)||!body.role||!ORGANIZATION_ROLES.includes(body.role as never))return NextResponse.json({error:"Retiro inválido"},{status:400});
  const{error}=await context.supabase!.rpc("remove_organization_member_access",{target_organization:body.organizationId,target_user:body.userId,target_context:body.context,target_role:body.role,target_venue:body.venueId||null});
  return error?NextResponse.json({error:error.message},{status:403}):NextResponse.json({ok:true});
}
