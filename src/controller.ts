export interface OfferProfile {
  label: string;
  proposer_share: number;
  responder_share: number;
}

export interface PlannedUltimatumCondition {
  condition: string;
  condition_label: string;
  proposer_share: number;
  responder_share: number;
  condition_id: string;
  trial_index: number;
}

export interface DecisionRecord {
  condition: string;
  block_idx: number;
  trial_index: number;
  choice: "accept" | "reject" | "timeout";
  accepted: boolean;
  earned: number;
  proposer_share: number;
  responder_share: number;
  total_earned: number;
}

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(values: T[], rng: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function normalizeProfiles(raw: Record<string, Partial<OfferProfile>>): Record<string, OfferProfile> {
  const profiles: Record<string, OfferProfile> = {};
  for (const [key, value] of Object.entries(raw)) {
    const proposerShare = Number(value.proposer_share ?? 5);
    const responderShare = Number(value.responder_share ?? 5);
    if (proposerShare < 0 || responderShare < 0) {
      throw new Error(`offer shares must be >=0 for condition '${key}'`);
    }
    profiles[String(key)] = {
      label: String(value.label ?? key),
      proposer_share: proposerShare,
      responder_share: responderShare
    };
  }
  if (Object.keys(profiles).length === 0) {
    throw new Error("controller.offer_profiles must be a non-empty mapping");
  }
  return profiles;
}

export class Controller {
  private readonly rng: () => number;
  private readonly profiles: Record<string, OfferProfile>;
  readonly seed: number;
  readonly enable_logging: boolean;
  private history: DecisionRecord[] = [];
  total_earned = 0;

  constructor(args: {
    offer_profiles: Record<string, Partial<OfferProfile>>;
    seed?: number;
    enable_logging?: boolean;
  }) {
    this.seed = Number(args.seed ?? 2023);
    this.enable_logging = args.enable_logging !== false;
    this.rng = makeSeededRandom(this.seed);
    this.profiles = normalizeProfiles(args.offer_profiles);
  }

  static from_dict(config: Record<string, unknown>): Controller {
    const rawProfiles = config.offer_profiles;
    if (!rawProfiles || typeof rawProfiles !== "object" || Array.isArray(rawProfiles)) {
      throw new Error("controller.offer_profiles must be a non-empty mapping");
    }
    return new Controller({
      offer_profiles: rawProfiles as Record<string, Partial<OfferProfile>>,
      seed: Number(config.seed ?? 2023),
      enable_logging: Boolean(config.enable_logging ?? true)
    });
  }

  get_profile(condition: string): OfferProfile {
    const key = String(condition);
    const profile = this.profiles[key];
    if (!profile) {
      throw new Error(`Unknown condition: ${key}`);
    }
    return profile;
  }

  prepare_block(args: { block_idx: number; n_trials: number; conditions: string[] }): string[] {
    const nTrials = Math.max(0, Math.trunc(args.n_trials));
    if (nTrials <= 0) {
      return [];
    }
    const validConditions = (Array.isArray(args.conditions) ? args.conditions : [])
      .map(String)
      .filter((condition) => this.profiles[condition] != null);
    if (validConditions.length === 0) {
      throw new Error("No valid ultimatum conditions available.");
    }

    const scheduled: string[] = [];
    for (let index = 0; index < nTrials; index += 1) {
      scheduled.push(validConditions[index % validConditions.length]);
    }
    shuffleInPlace(scheduled, this.rng);

    const planned: PlannedUltimatumCondition[] = [];
    scheduled.forEach((condition, index) => {
      const trialIndex = index + 1;
      const profile = this.get_profile(condition);
      const conditionId = `${condition}_P${profile.proposer_share}_R${profile.responder_share}_t${String(
        trialIndex
      ).padStart(3, "0")}`;
      planned.push({
        condition,
        condition_label: profile.label,
        proposer_share: profile.proposer_share,
        responder_share: profile.responder_share,
        condition_id: conditionId,
        trial_index: trialIndex
      });
    });
    return planned.map((item) => JSON.stringify(item));
  }

  register_decision(args: {
    condition: string;
    block_idx: number;
    trial_index: number;
    choice: "accept" | "reject" | "timeout";
    accepted: boolean;
    earned: number;
    proposer_share: number;
    responder_share: number;
  }): number {
    this.total_earned += Number(args.earned);
    const item: DecisionRecord = {
      condition: String(args.condition),
      block_idx: Number(args.block_idx),
      trial_index: Number(args.trial_index),
      choice: args.choice,
      accepted: Boolean(args.accepted),
      earned: Number(args.earned),
      proposer_share: Number(args.proposer_share),
      responder_share: Number(args.responder_share),
      total_earned: Number(this.total_earned)
    };
    this.history.push(item);
    return this.total_earned;
  }

  get histories(): Record<string, DecisionRecord[]> {
    const grouped: Record<string, DecisionRecord[]> = {};
    for (const item of this.history) {
      if (!grouped[item.condition]) {
        grouped[item.condition] = [];
      }
      grouped[item.condition].push(item);
    }
    return grouped;
  }
}
