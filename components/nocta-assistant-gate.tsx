import { agentFlags } from "@/lib/ai/flags";
import { NoctaAssistant } from "@/components/nocta-assistant";

export function NoctaAssistantGate() {
  const flags = agentFlags();
  if (!flags.enabled) return null;
  return <NoctaAssistant writeActionsEnabled={flags.writeActionsEnabled}/>;
}
