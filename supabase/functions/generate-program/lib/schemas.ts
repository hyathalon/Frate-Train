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
  'Mobility', 'Aerobic', 'RaceSim', 'Compromised', 'Station',
] as const;
export type Format = (typeof FORMATS)[number];

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

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
  minutes: number;
  items: SessionItem[];
  timing?: Record<string, unknown>; // added server-side from plan_format
}

export interface Session {
  day: (typeof DAYS)[number];
  title: string;
  key_session: boolean;
  pillar: (typeof PILLARS)[number];
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

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['exercise_id', 'race_session_id', 'dose', 'cue', 'block', 'foot_contacts', 'run_minutes', 'run_distance_m'],
  properties: {
    exercise_id: nullable({ type: 'string' }),
    race_session_id: nullable({ type: 'string' }),
    dose: { type: 'string' },
    cue: nullable({ type: 'string' }),
    block: nullable({ type: 'integer' }),
    foot_contacts: nullable({ type: 'integer' }),
    run_minutes: nullable({ type: 'number' }),
    run_distance_m: nullable({ type: 'integer' }),
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
              required: ['day', 'title', 'key_session', 'pillar', 'optional', 'slot', 'parts'],
              properties: {
                day: { type: 'string', enum: [...DAYS] },
                title: { type: 'string' },
                key_session: { type: 'boolean' },
                pillar: { type: 'string', enum: [...PILLARS] },
                optional: { type: 'boolean' },
                slot: nullable({ type: 'string' }),
                parts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['format', 'template_id', 'minutes', 'items'],
                    properties: {
                      format: { type: 'string', enum: [...FORMATS] },
                      template_id: nullable({ type: 'string' }),
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
