// JSON Schemas for Claude's structured outputs. The API guarantees the shape;
// validate.ts checks everything a schema can't express (ids, counts, ranges).

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
export const METHODS = ['Run', 'Erg', 'Strength', 'Circuit', 'Plyometric', 'Mobility', 'Hyrox'] as const;
export const TEMPLATE_METHODS = ['Strength', 'Circuit', 'Plyometric', 'Mobility'] as const;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export interface OutlineWeek {
  week: number;
  phase: (typeof PHASE_KINDS)[number];
  focus: string;
  load: 'Low' | 'Moderate' | 'High';
  deload: boolean;
  core_sessions: number;
  optional_sessions: number;
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
    summary: { type: 'string', description: 'Two or three sentences the athlete sees about the season.' },
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
        required: ['week', 'phase', 'focus', 'load', 'deload', 'core_sessions', 'optional_sessions', 'key_sessions', 'pillars'],
        properties: {
          week: { type: 'integer' },
          phase: { type: 'string', enum: [...PHASE_KINDS] },
          focus: { type: 'string' },
          load: { type: 'string', enum: ['Low', 'Moderate', 'High'] },
          deload: { type: 'boolean' },
          core_sessions: { type: 'integer' },
          optional_sessions: { type: 'integer' },
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
  notes: string | null;
}

export interface Session {
  day: (typeof DAYS)[number];
  title: string;
  method: (typeof METHODS)[number];
  template_id: string | null;
  duration_min: number;
  pillar: (typeof PILLARS)[number];
  optional: boolean;
  slot: string | null;
  items: SessionItem[];
  timing?: Record<string, unknown>; // added server-side from plan_session
}

export interface Block {
  summary: string;
  weeks: { week: number; focus: string; sessions: Session[] }[];
}

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
        required: ['week', 'focus', 'sessions'],
        properties: {
          week: { type: 'integer' },
          focus: { type: 'string' },
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['day', 'title', 'method', 'template_id', 'duration_min', 'pillar', 'optional', 'slot', 'items'],
              properties: {
                day: { type: 'string', enum: [...DAYS] },
                title: { type: 'string' },
                method: { type: 'string', enum: [...METHODS] },
                template_id: nullable({ type: 'string' }),
                duration_min: { type: 'integer' },
                pillar: { type: 'string', enum: [...PILLARS] },
                optional: { type: 'boolean' },
                slot: nullable({ type: 'string' }),
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['exercise_id', 'race_session_id', 'dose', 'notes'],
                    properties: {
                      exercise_id: nullable({ type: 'string' }),
                      race_session_id: nullable({ type: 'string' }),
                      dose: { type: 'string' },
                      notes: nullable({ type: 'string' }),
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
