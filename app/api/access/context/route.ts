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
  const entries=await Promise.all(Object.entries(grupos).map(async([key,roles])=>{const {data}=await supabase.rpc("current_user_has_any_role",{required_roles:[...roles]});return [key,Boolean(data)] as const;}));
  return NextResponse.json({permissions:Object.fromEntries(entries)});
}
