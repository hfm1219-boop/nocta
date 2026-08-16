import type { ReactNode } from "react";
import { BusinessShell } from "@/components/business-shell";
export default function BrandLayout({ children }: { children: ReactNode }) { return <BusinessShell kind="brand_distributor">{children}</BusinessShell>; }
