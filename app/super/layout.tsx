import { SuperNav } from "@/components/super-nav";
import type { ReactNode } from "react";

export default function SuperLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh lg:flex"><SuperNav/><div className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</div></div>;
}
