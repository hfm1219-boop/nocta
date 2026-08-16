import type { ReactNode } from "react";
import { BusinessShell } from "@/components/business-shell";
export default function EstablishmentLayout({ children }: { children: ReactNode }) { return <BusinessShell kind="establishment">{children}</BusinessShell>; }
