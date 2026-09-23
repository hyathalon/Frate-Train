// -- ALTER TABLE workout_logs ADD COLUMN pillar_id text;
// -- ALTER TABLE workout_logs ADD COLUMN secondary_pillar_id text;

export const PILLARS = [
  {
    id: 'aerobic_engine',
    name: 'Aerobic Engine',
    color: '#3B82F6',
    description: 'VO₂max, aerobic capacity, aerobic efficiency',
  },
  {
    id: 'threshold',
    name: 'Threshold',
    color: '#F59E0B',
    description: 'LT1/LT2, pace sustainability, intensity management',
  },
  {
    id: 'durability',
    name: 'Durability',
    color: '#10B981',
    description: 'Resistance to physiological decline under fatigue',
  },
  {
    id: 'economy',
    name: 'Economy',
    color: '#8B5CF6',
    description: 'Running technique, movement efficiency, station mechanics',
  },
  {
    id: 'balanced_athleticism',
    name: 'Balanced Athleticism',
    color: '#EF4444',
    description: 'Strength endurance, mobility, movement quality, injury resilience',
  },
  {
    id: 'fatigue_management',
    name: 'Fatigue Management',
    color: '#06B6D4',
    description: 'Recovery, compromised efforts, HRV monitoring',
  },
  {
    id: 'training_principles',
    name: 'Training Principles',
    color: '#84CC16',
    description: 'Frequency, volume, intensity, specificity',
  },
  {
    id: 'connection_courage',
    name: 'Connection & Courage',
    color: '#FF4D1A',
    description: 'Coach relationship, community, belief without pressure',
  },
];

export const WORKOUT_PILLAR_MAP = {
  'Zone 2 Run': 'aerobic_engine',
  'Long Run': 'aerobic_engine',
  'Tempo Run': 'threshold',
  'Threshold Intervals': 'threshold',
  'Race Pace': 'threshold',
  Strength: 'balanced_athleticism',
  Mobility: 'balanced_athleticism',
  'Station Training': 'economy',
  Technique: 'economy',
  'Compromised Run': 'fatigue_management',
  Recovery: 'fatigue_management',
  'HRV Check': 'fatigue_management',
  'Hyrox Specific': 'economy',
  Power: 'balanced_athleticism',
  Endurance: 'durability',
  'Group Session': 'connection_courage',
  Race: 'durability',
  Rest: 'fatigue_management',
};

export function getPillarById(pillarId) {
  return PILLARS.find((p) => p.id === pillarId) ?? null;
}

export function getPillarForWorkoutType(workoutType) {
  const pillarId = WORKOUT_PILLAR_MAP[workoutType];
  return pillarId ? getPillarById(pillarId) : null;
}
