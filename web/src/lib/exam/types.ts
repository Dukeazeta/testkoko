export type SessionPolicy = "BlockNew" | "KickOld";

export type CandidateStatus = "Active" | "Disconnected" | "Flagged" | "Submitted";

export type StrikeEventType =
  | "visibility_hidden"
  | "visibility_visible"
  | "devtools_open"
  | "multiple_session_attempt"
  | "disconnect"
  | "reconnect";

export interface StrikeThresholds {
  warning: number;
  temporaryLock: number;
  autoSubmit: number;
}

export interface StrikeEvent {
  type: StrikeEventType;
  hiddenDurationSeconds?: number;
  timestamp: string;
}

export interface StrikeDecision {
  addedStrikes: number;
  totalStrikes: number;
  action: "none" | "warning" | "temporary_lock" | "auto_submit";
}
