import type { ReducedTrialRow } from "psyflow-web";

import type { PlannedUltimatumCondition } from "./controller";

export function parse_ultimatum_condition(condition: string): PlannedUltimatumCondition {
  const parsed = JSON.parse(String(condition)) as Partial<PlannedUltimatumCondition>;
  return {
    condition: String(parsed.condition ?? "fair"),
    condition_label: String(parsed.condition_label ?? parsed.condition ?? "fair"),
    proposer_share: Number(parsed.proposer_share ?? 5),
    responder_share: Number(parsed.responder_share ?? 5),
    condition_id: String(parsed.condition_id ?? "unknown"),
    trial_index: Math.max(1, Number(parsed.trial_index ?? 1))
  };
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string): {
  accept_rate: string;
  block_earned: number;
  total_earned: number;
} {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  const n = Math.max(1, blockRows.length);
  const acceptedN = blockRows.filter((row) => row.accepted === true).length;
  const blockEarned = blockRows.reduce((sum, row) => sum + Number(row.earned ?? 0), 0);
  const totalEarned = rows.length > 0 ? Number(rows[rows.length - 1].total_earned ?? 0) : 0;
  return {
    accept_rate: `${((acceptedN / n) * 100).toFixed(1)}%`,
    block_earned: blockEarned,
    total_earned: totalEarned
  };
}

export function summarizeOverall(rows: ReducedTrialRow[]): {
  total_earned: number;
} {
  return {
    total_earned: rows.length > 0 ? Number(rows[rows.length - 1].total_earned ?? 0) : 0
  };
}
