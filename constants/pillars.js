// -- ALTER TABLE workout_logs ADD COLUMN pillar_id text;
// -- ALTER TABLE workout_logs ADD COLUMN secondary_pillar_id text;

export const PILLARS = [
  {
    id: 'aerobic_engine',
    name: 'Aerobic Engine',
    tagline: 'Build the engine that never quits',
    color: '#3B82F6',
    number: '01',
  },
  {
    id: 'threshold',
    name: 'Threshold',
    tagline: 'Find the edge. Hold it.',
    color: '#F59E0B',
    number: '02',
  },
  {
    id: 'durability',
    name: 'Durability',
    tagline: 'Still strong when it gets hard',
    color: '#10B981',
    number: '03',
  },
  {
    id: 'economy',
    name: 'Economy',
    tagline: 'Move better. Use less.',
    color: '#8B5CF6',
    number: '04',
  },
  {
    id: 'balanced_athleticism',
    name: 'Balanced Athleticism',
    tagline: 'No weak links. No race day surprises.',
    color: '#EF4444',
    number: '05',
  },
  {
    id: 'fatigue_management',
    name: 'Fatigue Management',
    tagline: 'Train hard. Recover harder.',
    color: '#06B6D4',
    number: '06',
  },
  {
    id: 'training_principles',
    name: 'Training Principles',
    tagline: 'The method behind the madness',
    color: '#84CC16',
    number: '07',
  },
  {
    id: 'connection_courage',
    name: 'Connection & Courage',
    tagline: 'Show up. Back yourself. Celebrate together.',
    color: '#FF4D1A',
    number: '08',
  },
];

export const PILLAR_MAP = {
  aerobic_engine: PILLARS[0],
  threshold: PILLARS[1],
  durability: PILLARS[2],
  economy: PILLARS[3],
  balanced_athleticism: PILLARS[4],
  fatigue_management: PILLARS[5],
  training_principles: PILLARS[6],
  connection_courage: PILLARS[7],
};

// Map workout/session types → pillar id
export const WORKOUT_PILLAR_MAP = {
  'Zone 2 Run': 'aerobic_engine',
  'Easy Run': 'aerobic_engine',
  'Long Run': 'aerobic_engine',
  'Aerobic Base': 'aerobic_engine',
  'Tempo Run': 'threshold',
  'Threshold Intervals': 'threshold',
  'Race Pace': 'threshold',
  'Cruise Intervals': 'threshold',
  VO2max: 'threshold',
  'Endurance Run': 'durability',
  'Back to Back': 'durability',
  'Race Simulation': 'durability',
  'Fatigue Run': 'durability',
  'Station Training': 'economy',
  Technique: 'economy',
  'Hyrox Specific': 'economy',
  Skills: 'economy',
  Strength: 'balanced_athleticism',
  Mobility: 'balanced_athleticism',
  Power: 'balanced_athleticism',
  Gym: 'balanced_athleticism',
  'Compromised Run': 'fatigue_management',
  'Brick Session': 'fatigue_management',
  Recovery: 'fatigue_management',
  'HRV Check': 'fatigue_management',
  Rest: 'fatigue_management',
  Deload: 'fatigue_management',
  'Group Session': 'connection_courage',
  Race: 'durability',
};

export function getPillarById(pillarId) {
  return PILLAR_MAP[pillarId] ?? null;
}

export function getPillarForWorkoutType(workoutType) {
  const pillarId = WORKOUT_PILLAR_MAP[workoutType];
  return pillarId ? getPillarById(pillarId) : null;
}
