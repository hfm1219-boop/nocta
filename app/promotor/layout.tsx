import type { ReactNode } from "react";
import { BusinessShell } from "@/components/business-shell";
export default function PromoterLayout({ children }: { children: ReactNode }) { return <BusinessShell kind="promoter">{children}</BusinessShell>; }
