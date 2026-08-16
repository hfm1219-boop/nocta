"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { availableContexts, routeForContext, type AccessContext } from "@/lib/auth/context";
import { PRINCIPAL_ROLE_LABELS } from "@/lib/auth/roles";

export function ContextSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [access, setAccess] = useState<AccessContext>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void fetch("/api/auth/context", { cache: "no-store" }).then(async (response) => { if (response.ok && active) setAccess(await response.json()); }); return () => { active = false; }; }, []);
  const options = useMemo(() => access ? availableContexts(access) : [], [access]);
  if (!access?.activeContext) return null;
  const current = `${access.activeContext.organizationId ?? "global"}:${access.activeContext.role}`;
  async function change(value: string) {
    const option = options.find((item) => `${item.organizationId ?? "global"}:${item.role}` === value); if (!option) return;
    setBusy(true); const response = await fetch("/api/auth/context", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: option.organizationId, role: option.role }) });
    if (response.ok) { const next = await response.json() as AccessContext; setAccess(next); router.replace(routeForContext(next)); router.refresh(); } setBusy(false);
  }
  if (options.length < 2) return compact ? <p className="truncate text-xs text-muted">{access.activeContext.organizationName ?? PRINCIPAL_ROLE_LABELS[access.activeContext.role]}</p> : null;
  return <label className="block"><span className="sr-only">Cambiar organización o contexto</span><select aria-label="Cambiar organización o contexto" disabled={busy} value={current} onChange={(event) => void change(event.target.value)} className={`rounded-xl border border-line bg-surface2 text-foreground outline-none ${compact ? "w-full px-3 py-2 text-xs" : "entrada"}`}>{options.map((item) => <option key={`${item.organizationId ?? "global"}-${item.role}`} value={`${item.organizationId ?? "global"}:${item.role}`}>{item.organizationName ? `${item.organizationName} · ` : ""}{PRINCIPAL_ROLE_LABELS[item.role]}</option>)}</select></label>;
}
