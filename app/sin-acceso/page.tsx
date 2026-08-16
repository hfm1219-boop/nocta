import Link from "next/link";
import { Logo } from "@/components/ui";

export default function SinAcceso() {
  return <main className="flex-1 px-5 py-12 max-w-md mx-auto w-full">
    <section className="card p-6 text-center space-y-4"><Logo size="text-3xl" /><p className="text-xs uppercase tracking-wider text-neon3">Permisos</p><h1 className="text-2xl font-bold">Tu cuenta no tiene acceso a este módulo</h1><p className="text-muted">Ingresa desde el menú correspondiente a tu rol o solicita acceso al administrador responsable.</p><Link href="/" className="btn-neon inline-block rounded-full px-5 py-3 font-semibold">Volver al inicio</Link></section>
  </main>;
}
