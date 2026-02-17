import type { StrikeDecision, StrikeEvent, StrikeThresholds } from "./types";

const defaultThresholds: StrikeThresholds = {
  warning: 3,
  temporaryLock: 5,
  autoSubmit: 8,
};

function strikeValueFromEvent(event: StrikeEvent): number {
  if (event.type === "multiple_session_attempt") {
    return 3;
  }

  if (event.type === "devtools_open") {
    return 1;
  }

  if (event.type === "visibility_hidden") {
    const duration = event.hiddenDurationSeconds ?? 0;
    if (duration < 3) return 0;
    if (duration <= 10) return 1;
    return 2;
  }

  return 0;
}

function actionFromTotal(totalStrikes: number, thresholds: StrikeThresholds): StrikeDecision["action"] {
  if (totalStrikes >= thresholds.autoSubmit) return "auto_submit";
  if (totalStrikes >= thresholds.temporaryLock) return "temporary_lock";
  if (totalStrikes >= thresholds.warning) return "warning";
  return "none";
}

export function evaluateStrike(
  currentStrikes: number,
  event: StrikeEvent,
  thresholds: StrikeThresholds = defaultThresholds,
): StrikeDecision {
  const addedStrikes = strikeValueFromEvent(event);
  const totalStrikes = currentStrikes + addedStrikes;

  return {
    addedStrikes,
    totalStrikes,
    action: actionFromTotal(totalStrikes, thresholds),
  };
}
