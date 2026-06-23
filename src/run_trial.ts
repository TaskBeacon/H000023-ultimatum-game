import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import type { Controller } from "./controller";
import { parse_ultimatum_condition } from "./utils";

function resolveChoiceLabel(response: unknown, acceptKey: string, rejectKey: string): "accept" | "reject" | "timeout" {
  if (response === acceptKey) {
    return "accept";
  }
  if (response === rejectKey) {
    return "reject";
  }
  return "timeout";
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    controller: Controller;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, controller, block_id, block_idx } = context;
  const parsed = parse_ultimatum_condition(condition);
  const keyList = (Array.isArray(settings.key_list) ? settings.key_list : ["f", "j"]).map(String);
  const acceptKey = keyList[0] ?? "f";
  const rejectKey = keyList[1] ?? "j";
  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;
  const trigger = (name: string): number | null => {
    const value = triggerMap[name];
    return value == null ? null : Number(value);
  };

  const offerCueDuration = Number(settings.offer_cue_duration ?? 0.5);
  const preDecisionFixationDuration = Number(settings.pre_decision_fixation_duration ?? 0.6);
  const offerDecisionDuration = Number(settings.offer_decision_duration ?? 2.0);
  const decisionConfirmationDuration = Number(settings.decision_confirmation_duration ?? 0.6);
  const payoffFeedbackDuration = Number(settings.payoff_feedback_duration ?? 1.0);
  const itiDuration = Number(settings.iti_duration ?? 0.8);

  const offerCue = trial.unit("offer_cue").addStim(stimBank.get("offer_cue"));
  set_trial_context(offerCue, {
    trial_id: trial.trial_id,
    phase: "offer_cue",
    deadline_s: offerCueDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "offer_cue",
      condition: parsed.condition,
      block_idx
    },
    stim_id: "offer_cue"
  });
  offerCue
    .show({ duration: offerCueDuration, onset_trigger: trigger(`${parsed.condition}_offer_cue_onset`) })
    .to_dict();

  const preDecisionFixation = trial.unit("pre_decision_fixation").addStim(stimBank.get("fixation"));
  set_trial_context(preDecisionFixation, {
    trial_id: trial.trial_id,
    phase: "pre_decision_fixation",
    deadline_s: preDecisionFixationDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "pre_decision_fixation",
      condition: parsed.condition,
      block_idx
    },
    stim_id: "fixation"
  });
  preDecisionFixation
    .show({
      duration: preDecisionFixationDuration,
      onset_trigger: trigger(`${parsed.condition}_pre_decision_fixation_onset`)
    })
    .to_dict();

  const offerDecision = trial.unit("offer_decision").addStim(
    stimBank.get_and_format("offer_panel", {
      proposer_share: parsed.proposer_share,
      responder_share: parsed.responder_share
    })
  );
  set_trial_context(offerDecision, {
    trial_id: trial.trial_id,
    phase: "offer_decision",
    deadline_s: offerDecisionDuration,
    valid_keys: [acceptKey, rejectKey],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "offer_decision",
      condition: parsed.condition,
      proposer_share: parsed.proposer_share,
      responder_share: parsed.responder_share,
      accept_key: acceptKey,
      reject_key: rejectKey,
      block_idx
    },
    stim_id: "offer_panel"
  });
  offerDecision
    .captureResponse({
      keys: [acceptKey, rejectKey],
      correct_keys: [acceptKey, rejectKey],
      duration: offerDecisionDuration,
      onset_trigger: trigger(`${parsed.condition}_offer_decision_onset`),
      response_trigger: Number(triggerMap.decision_response ?? 50),
      timeout_trigger: Number(triggerMap.decision_timeout ?? 51)
    })
    .set_state({
      choice_label: (snapshot: TrialSnapshot) =>
        resolveChoiceLabel(snapshot.units.offer_decision?.response, acceptKey, rejectKey),
      accepted: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.response === acceptKey,
      rejected: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.response === rejectKey,
      timed_out: (snapshot: TrialSnapshot) =>
        snapshot.units.offer_decision?.response !== acceptKey &&
        snapshot.units.offer_decision?.response !== rejectKey,
      earned: (snapshot: TrialSnapshot) =>
        snapshot.units.offer_decision?.response === acceptKey ? parsed.responder_share : 0
    })
    .to_dict();

  const decisionConfirmation = trial
    .unit("decision_confirmation")
    .addStim((snapshot: TrialSnapshot) => {
      const choice = String(snapshot.units.offer_decision?.choice_label ?? "timeout");
      if (choice === "accept") {
        return stimBank.get("decision_accept");
      }
      if (choice === "reject") {
        return stimBank.get("decision_reject");
      }
      return stimBank.get("decision_timeout");
    });
  set_trial_context(decisionConfirmation, {
    trial_id: trial.trial_id,
    phase: "decision_confirmation",
    deadline_s: decisionConfirmationDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "decision_confirmation",
      condition: parsed.condition,
      choice_label: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.choice_label,
      accepted: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.accepted,
      timed_out: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.timed_out,
      block_idx
    },
    stim_id: (snapshot: TrialSnapshot) => {
      const choice = String(snapshot.units.offer_decision?.choice_label ?? "timeout");
      if (choice === "accept") return "decision_accept";
      if (choice === "reject") return "decision_reject";
      return "decision_timeout";
    }
  });
  decisionConfirmation
    .show({ duration: decisionConfirmationDuration, onset_trigger: trigger("decision_confirmation_onset") })
    .to_dict();

  const payoffFeedback = trial.unit("payoff_feedback").addStim((snapshot: TrialSnapshot, runtime) =>
    stimBank.get_and_format("payoff_feedback", {
      earned: Number(snapshot.units.offer_decision?.earned ?? 0),
      total_earned: runtime.sumReducedField("earned") + Number(snapshot.units.offer_decision?.earned ?? 0),
      proposer_share: parsed.proposer_share,
      responder_share: parsed.responder_share
    })
  );
  set_trial_context(payoffFeedback, {
    trial_id: trial.trial_id,
    phase: "payoff_feedback",
    deadline_s: payoffFeedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "payoff_feedback",
      condition: parsed.condition,
      accepted: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.accepted,
      earned: (snapshot: TrialSnapshot) => snapshot.units.offer_decision?.earned,
      block_idx
    },
    stim_id: "payoff_feedback"
  });
  payoffFeedback.show({ duration: payoffFeedbackDuration, onset_trigger: trigger("payoff_feedback_onset") }).to_dict();

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: "inter_trial_interval",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "inter_trial_interval",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration, onset_trigger: trigger("iti_onset") }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const choiceLabel = resolveChoiceLabel(snapshot.units.offer_decision?.response, acceptKey, rejectKey);
    const accepted = choiceLabel === "accept";
    const rejected = choiceLabel === "reject";
    const timedOut = choiceLabel === "timeout";
    const earned = accepted ? parsed.responder_share : 0;
    const totalEarned = controller.register_decision({
      condition: parsed.condition,
      block_idx: block_idx,
      trial_index: parsed.trial_index,
      choice: choiceLabel,
      accepted,
      earned,
      proposer_share: parsed.proposer_share,
      responder_share: parsed.responder_share
    });
    helpers.setTrialState("planned_trial_index", parsed.trial_index);
    helpers.setTrialState("condition", parsed.condition);
    helpers.setTrialState("condition_id", parsed.condition_id);
    helpers.setTrialState("condition_label", parsed.condition_label);
    helpers.setTrialState("proposer_share", parsed.proposer_share);
    helpers.setTrialState("responder_share", parsed.responder_share);
    helpers.setTrialState("choice_label", choiceLabel);
    helpers.setTrialState("accepted", accepted);
    helpers.setTrialState("rejected", rejected);
    helpers.setTrialState("timed_out", timedOut);
    helpers.setTrialState("choice_rt", snapshot.units.offer_decision?.rt ?? null);
    helpers.setTrialState("earned", earned);
    helpers.setTrialState("total_earned", totalEarned);
    helpers.setTrialState("feedback_delta", earned);
  });

  return trial;
}
