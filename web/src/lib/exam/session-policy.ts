import type { SessionPolicy } from "./types";

export interface SessionValidationInput {
  hasActiveSession: boolean;
  policy: SessionPolicy;
}

export interface SessionValidationResult {
  allowNewSession: boolean;
  revokeOldSession: boolean;
  reason?: "ACTIVE_SESSION_BLOCKED";
}

export function evaluateSessionPolicy(input: SessionValidationInput): SessionValidationResult {
  if (!input.hasActiveSession) {
    return {
      allowNewSession: true,
      revokeOldSession: false,
    };
  }

  if (input.policy === "KickOld") {
    return {
      allowNewSession: true,
      revokeOldSession: true,
    };
  }

  return {
    allowNewSession: false,
    revokeOldSession: false,
    reason: "ACTIVE_SESSION_BLOCKED",
  };
}
