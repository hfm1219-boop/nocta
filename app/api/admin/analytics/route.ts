import{NextResponse}from"next/server";
import{crearClienteSupabaseServidor}from"@/lib/supabase/server";
export async function GET(){const supabase=await crearClienteSupabaseServidor();if(!supabase)return NextResponse.json({error:"Supabase no configurado"},{status:503});const{data,error}=await supabase.rpc("platform_analytics");if(error||!data)return NextResponse.json({error:error?.message??"Sin permisos"},{status:403});return NextResponse.json({analytics:data})}
