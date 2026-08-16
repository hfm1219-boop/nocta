import { NextResponse } from "next/server";
import { crearClienteSupabaseServidor } from "@/lib/supabase/server";

const grupos = {
  platform: ["platform_owner"], promoter: ["promoter", "organizer"],
  venue: ["venue_owner", "venue_admin", "door_staff", "reservation_host", "cashier", "bartender", "waiter", "dj", "analyst"],
  door: ["door_staff", "venue_owner", "venue_admin", "organizer"], reservations: ["reservation_host", "venue_owner", "venue_admin", "organizer"],
  bar: ["bartender", "cashier", "venue_owner", "venue_admin"], waiter: ["waiter", "venue_owner", "venue_admin"],
  dj: ["dj", "venue_owner", "venue_admin"], admin: ["venue_owner", "venue_admin"],
} as const;

export async function GET(){
  const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});
  const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)return NextResponse.json({error:"No autenticado"},{status:401});
  const [{data:access,error:accessError},entries]=await Promise.all([
    supabase.rpc("get_my_access_context"),
    Promise.all(Object.entries(grupos).map(async([key,roles])=>{const {data}=await supabase.rpc("current_user_has_any_role",{required_roles:[...roles]});return [key,Boolean(data)] as const;})),
  ]);
  if(accessError)return NextResponse.json({error:accessError.message},{status:400});
  const active=access?.activeContext as{organizationId?:string|null;organizationName?:string|null;role?:string}|undefined;
  const organization=(access?.organizations as Array<{id:string;roles:Array<{context:string;role:string;venueId?:string|null}>}>|undefined)?.find(item=>item.id===active?.organizationId);
  const canonicalRoles=(organization?.roles??[]).filter(item=>item.context==="establishment").map(item=>item.role);
  const manager=canonicalRoles.some(role=>["owner","admin","establishment_admin"].includes(role));
  const permissions={...Object.fromEntries(entries),platform:active?.role==="nocta_admin"||Object.fromEntries(entries).platform,promoter:active?.role==="promoter",venue:active?.role==="establishment",admin:active?.role==="establishment"&&manager,door:active?.role==="establishment"&&manager,reservations:active?.role==="establishment"&&manager,bar:active?.role==="establishment"&&(manager||canonicalRoles.includes("bar")||canonicalRoles.includes("cashier")),waiter:active?.role==="establishment"&&(manager||canonicalRoles.includes("waiter")),dj:active?.role==="establishment"&&manager};
  let venues:Array<{id:string;external_key:string;name:string;city:string}>=[];
  if(active?.role==="establishment"&&active.organizationId){const result=await supabase.from("venues").select("id,external_key,name,city").eq("organization_id",active.organizationId).eq("active",true).order("name");if(result.error)return NextResponse.json({error:result.error.message},{status:400});const scopedIds=new Set((organization?.roles??[]).filter(item=>item.context==="establishment"&&item.venueId).map(item=>item.venueId));venues=(result.data??[]).filter(item=>manager||!scopedIds.size||scopedIds.has(item.id));}
  return NextResponse.json({permissions,activeContext:active??null,roles:canonicalRoles,venues});
}
