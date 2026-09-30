// JSON Schemas for Claude's structured outputs. The API guarantees the shape;
// validate.ts checks everything a schema can't express (ids, counts, timing).

export const PILLARS = [
  'Aerobic Engine',
  'Threshold',
  'Durability',
  'Economy',
  'Balanced Athleticism',
  'Fatigue Management',
] as const;

export const PHASE_KINDS = ['base', 'build', 'specific', 'taper'] as const;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const LEVERS = ['start', 'frequency', 'intensity', 'volume', 'deload'] as const;

// Part formats; rules and timing live in the session_formats table / plan_format().
export const FORMATS = [
  'Strength', 'Circuit', 'Tabata', 'HIIT', 'AMRAP', 'EMOM', 'ForTime', 'Plyometric',
  'Mobility', 'Aerobic', 'RaceSim', 'Compromised', 'Station', 'Run',
] as const;
export type Format = (typeof FORMATS)[number];
export const RUN_TYPES = ['key', 'easy', 'long', 'recovery'] as const;
// The athlete's running choice: we program it, they have their own plan, or none.
export const RUNNING_MODES = ['programmed', 'own_plan', 'none'] as const;
export type RunningMode = (typeof RUNNING_MODES)[number];
export type RunType = (typeof RUN_TYPES)[number];
// Borrowed from docs/coaching/session-schema.json (design reference).
export const SESSION_TYPES = [
  'recovery', 'easy_steady', 'long', 'progression', 'aerobic_threshold', 'lactate_threshold', 'critical_velocity',
  'vo2max', 'speed', 'compromised', 'station_skill', 'strength_endurance',
] as const;
export const PROGRESSION_TYPES = ['extend', 'qualify', 'benchmark'] as const;
export const CAN_DOUBLE = ['no', 'sometimes', 'yes'] as const;
export type CanDouble = (typeof CAN_DOUBLE)[number];
export const STRENGTH_PLACEMENTS = ['with_hard_sessions', 'own_days'] as const;
export type StrengthPlacement = (typeof STRENGTH_PLACEMENTS)[number];
// Onboarding 3b: what holds the athlete back most in a race (up to 2).
export const LIMITERS = ['running', 'strength', 'strength_endurance', 'aerobic_fitness', 'not_sure'] as const;
export type Limiter = (typeof LIMITERS)[number];
export const STRENGTH_SESSIONS_RANGE: [number, number] = [2, 6]; // onboarding 10d

export interface OutlineWeek {
  week: number;
  phase: (typeof PHASE_KINDS)[number];
  focus: string;
  load: 'Low' | 'Moderate' | 'High';
  deload: boolean;
  lever: (typeof LEVERS)[number];
  core_sessions: number;
  optional_sessions: number;
  key_session: string;
  key_sessions: string[];
  pillars: (typeof PILLARS)[number][];
}

export interface Outline {
  summary: string;
  phases: { name: string; kind: (typeof PHASE_KINDS)[number]; start_week: number; end_week: number; purpose: string }[];
  weeks: OutlineWeek[];
}

export const OUTLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'phases', 'weeks'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences the athlete sees about the season. Describe core and optional sessions accurately.' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'start_week', 'end_week', 'purpose'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: [...PHASE_KINDS] },
          start_week: { type: 'integer' },
          end_week: { type: 'integer' },
          purpose: { type: 'string' },
        },
      },
    },
    weeks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['week', 'phase', 'focus', 'load', 'deload', 'lever', 'core_sessions', 'optional_sessions', 'key_session', 'key_sessions', 'pillars'],
        properties: {
          week: { type: 'integer' },
          phase: { type: 'string', enum: [...PHASE_KINDS] },
          focus: { type: 'string' },
          load: { type: 'string', enum: ['Low', 'Moderate', 'High'] },
          deload: { type: 'boolean' },
          lever: { type: 'string', enum: [...LEVERS], description: 'The one progression lever this week uses.' },
          core_sessions: { type: 'integer' },
          optional_sessions: { type: 'integer' },
          key_session: { type: 'string', description: 'The week\'s key session, in a few words.' },
          key_sessions: { type: 'array', items: { type: 'string' } },
          pillars: { type: 'array', items: { type: 'string', enum: [...PILLARS] } },
        },
      },
    },
  },
} as const;

// Optional fields are left out of Claude's answer when empty (fewer output
// tokens); normalizeBlock() fills them with null before validation.
export interface SessionItem {
  exercise_id: string | null;
  race_session_id: string | null;
  dose: string;
  cue: string | null;
  block: number | null; // Tabata block number
  foot_contacts: number | null; // Plyometric
  run_minutes: number | null; // Compromised: minutes of running in this item
  run_distance_m: number | null; // RaceSim: run segment distance
}

export interface SessionPart {
  format: Format;
  template_id: string | null;
  run_type: RunType | null; // Run parts only
  minutes: number;
  items: SessionItem[];
  timing?: Record<string, unknown>; // added server-side from plan_format
}

export interface Session {
  day: (typeof DAYS)[number];
  order_in_day: 1 | 2; // 1 = first session of the day (AM), 2 = second (PM)
  title: string;
  key_session: boolean;
  pillar: (typeof PILLARS)[number];
  session_type: (typeof SESSION_TYPES)[number];
  build_or_maintain: 'build' | 'maintain';
  progression: { type: (typeof PROGRESSION_TYPES)[number]; change: string };
  alternatives: { modality: string; note: string | null }[]; // cross-training alternatives, preferred first
  optional: boolean;
  slot: string | null;
  parts: SessionPart[];
  frame?: { warmup_min: number; cooldown_min: number; total_min: number }; // added server-side
}

export interface BlockWeek {
  week: number;
  focus: string;
  progression: { lever: (typeof LEVERS)[number]; change: string };
  sessions: Session[];
}

export interface Block {
  summary: string;
  weeks: BlockWeek[];
}

// Only dose is required; give exactly one of exercise_id / race_session_id and
// the other fields only when they apply.
const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dose'],
  properties: {
    exercise_id: { type: 'string' },
    race_session_id: { type: 'string' },
    dose: { type: 'string' },
    cue: { type: 'string' },
    block: { type: 'integer' },
    foot_contacts: { type: 'integer' },
    run_minutes: { type: 'number' },
    run_distance_m: { type: 'integer' },
  },
};

export const BLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'weeks'],
  properties: {
    summary: { type: 'string', description: 'One or two sentences the athlete sees about these weeks.' },
    weeks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['week', 'focus', 'progression', 'sessions'],
        properties: {
          week: { type: 'integer' },
          focus: { type: 'string' },
          progression: {
            type: 'object',
            additionalProperties: false,
            required: ['lever', 'change'],
            properties: {
              lever: { type: 'string', enum: [...LEVERS] },
              change: { type: 'string', description: 'What progresses this week (or how it deloads), in one sentence.' },
            },
          },
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['day', 'order_in_day', 'title', 'key_session', 'pillar', 'session_type', 'build_or_maintain', 'progression', 'optional', 'parts'],
              properties: {
                day: { type: 'string', enum: [...DAYS] },
                order_in_day: { type: 'integer', enum: [1, 2], description: '1 = first session of the day (AM), 2 = second (PM).' },
                title: { type: 'string' },
                key_session: { type: 'boolean' },
                pillar: { type: 'string', enum: [...PILLARS] },
                session_type: { type: 'string', enum: [...SESSION_TYPES] },
                build_or_maintain: { type: 'string', enum: ['build', 'maintain'] },
                progression: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['type', 'change'],
                  properties: {
                    type: { type: 'string', enum: [...PROGRESSION_TYPES] },
                    change: { type: 'string', description: 'What changed versus the last similar session, in a few words.' },
                  },
                },
                alternatives: {
                  type: 'array',
                  description: 'Cross-training alternatives from the athlete\'s equipment, preferred first.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['modality'],
                    properties: { modality: { type: 'string' }, note: { type: 'string' } },
                  },
                },
                optional: { type: 'boolean' },
                slot: { type: 'string' },
                parts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['format', 'minutes', 'items'],
                    properties: {
                      format: { type: 'string', enum: [...FORMATS] },
                      template_id: { type: 'string' },
                      run_type: { type: 'string', enum: [...RUN_TYPES] },
                      minutes: { type: 'number' },
                      items: { type: 'array', items: ITEM_SCHEMA },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Fills the optional fields Claude left out with null, so validation and storage see one shape. */
export function normalizeBlock(block: Block): Block {
  for (const week of block.weeks ?? []) {
    for (const session of week.sessions ?? []) {
      session.slot ??= null;
      session.order_in_day ??= 1;
      session.alternatives ??= [];
      for (const alt of session.alternatives) alt.note ??= null;
      for (const part of session.parts ?? []) {
        part.template_id ??= null;
        part.run_type ??= null;
        for (const item of part.items ?? []) {
          item.exercise_id ??= null;
          item.race_session_id ??= null;
          item.cue ??= null;
          item.block ??= null;
          item.foot_contacts ??= null;
          item.run_minutes ??= null;
          item.run_distance_m ??= null;
        }
      }
    }
  }
  return block;
}
