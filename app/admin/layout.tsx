import type { ReactNode } from "react";
import { BusinessShell } from "@/components/business-shell";
import { NoctaAssistantGate } from "@/components/nocta-assistant-gate";
export default function EstablishmentLayout({ children }: { children: ReactNode }) { return <><BusinessShell kind="establishment">{children}</BusinessShell><NoctaAssistantGate/></>; }
