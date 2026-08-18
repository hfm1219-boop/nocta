import type { AgentFlags } from "@/lib/ai/types";

function enabled(value: string | undefined) { return /^(1|true|yes|on)$/i.test(value ?? ""); }

export function agentFlags(): AgentFlags {
  return {
    enabled: enabled(process.env.AI_ASSISTANT_ENABLED),
    writeActionsEnabled: enabled(process.env.AI_AGENT_WRITE_ACTIONS_ENABLED),
  };
}
