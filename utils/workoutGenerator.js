import { todayISODate } from './date';

export const QUICK_WORKOUT_TIME_OPTIONS = ['15', '30', '45', '60'];
export const QUICK_WORKOUT_EQUIPMENT_OPTIONS = ['Bodyweight', 'Dumbbells', 'Full Gym', 'Hyrox Equipment'];
export const QUICK_WORKOUT_FOCUS_OPTIONS = [
  'Strength',
  'Endurance',
  'Hyrox Simulation',
  'Running',
  'Recovery',
];

const TIME_TO_COUNT = { 15: 3, 30: 4, 45: 5, 60: 6 };

const EXERCISE_POOLS = {
  Strength: {
    Bodyweight: [
      { name: 'Push-Ups', sets: 3, reps: '12-15' },
      { name: 'Air Squats', sets: 3, reps: '15-20' },
      { name: 'Walking Lunges', sets: 3, reps: '12 / side' },
      { name: 'Plank Hold', sets: 3, reps: '45 sec' },
      { name: 'Glute Bridges', sets: 3, reps: '15-20' },
      { name: 'Step-Ups', sets: 3, reps: '12 / side' },
    ],
    Dumbbells: [
      { name: 'DB Goblet Squats', sets: 3, reps: '10-12' },
      { name: 'DB Bent-Over Rows', sets: 3, reps: '10-12' },
      { name: 'DB Shoulder Press', sets: 3, reps: '10-12' },
      { name: 'DB Romanian Deadlifts', sets: 3, reps: '10-12' },
      { name: 'DB Walking Lunges', sets: 3, reps: '12 / side' },
      { name: 'DB Bicep Curls', sets: 3, reps: '12-15' },
    ],
    'Full Gym': [
      { name: 'Barbell Back Squat', sets: 4, reps: '8-10' },
      { name: 'Bench Press', sets: 4, reps: '8-10' },
      { name: 'Deadlift', sets: 3, reps: '6-8' },
      { name: 'Lat Pulldown', sets: 3, reps: '10-12' },
      { name: 'Leg Press', sets: 3, reps: '10-12' },
      { name: 'Seated Cable Row', sets: 3, reps: '10-12' },
    ],
    'Hyrox Equipment': [
      { name: 'Sled Push', sets: 3, reps: '25m' },
      { name: 'Sled Pull', sets: 3, reps: '25m' },
      { name: 'Farmers Carry', sets: 3, reps: '100m' },
      { name: 'Sandbag Lunges', sets: 3, reps: '50m' },
      { name: 'Wall Balls', sets: 3, reps: '20' },
      { name: 'Kettlebell Swings', sets: 3, reps: '15' },
    ],
  },
  Endurance: {
    Bodyweight: [
      { name: 'Burpees', sets: 1, reps: '45 sec on / 15 sec off' },
      { name: 'Mountain Climbers', sets: 1, reps: '45 sec on / 15 sec off' },
      { name: 'Jumping Jacks', sets: 1, reps: '45 sec on / 15 sec off' },
      { name: 'High Knees', sets: 1, reps: '45 sec on / 15 sec off' },
      { name: 'Squat Jumps', sets: 1, reps: '45 sec on / 15 sec off' },
      { name: 'Shuttle Runs', sets: 1, reps: '45 sec on / 15 sec off' },
    ],
    Dumbbells: [
      { name: 'DB Thrusters', sets: 1, reps: '40 sec on / 20 sec off' },
      { name: 'DB Snatch', sets: 1, reps: '40 sec on / 20 sec off (each side)' },
      { name: 'DB Man Makers', sets: 1, reps: '40 sec on / 20 sec off' },
      { name: 'DB Renegade Rows', sets: 1, reps: '40 sec on / 20 sec off' },
      { name: 'DB Swings', sets: 1, reps: '40 sec on / 20 sec off' },
      { name: 'DB Step-Ups', sets: 1, reps: '40 sec on / 20 sec off' },
    ],
    'Full Gym': [
      { name: 'Assault Bike', sets: 1, reps: '3 min' },
      { name: 'Rowing Machine', sets: 1, reps: '500m' },
      { name: 'Treadmill Intervals', sets: 1, reps: '3 min' },
      { name: 'Battle Ropes', sets: 1, reps: '40 sec' },
      { name: 'Stair Climber', sets: 1, reps: '3 min' },
      { name: 'Jump Rope', sets: 1, reps: '2 min' },
    ],
    'Hyrox Equipment': [
      { name: 'SkiErg', sets: 1, reps: '500m' },
      { name: 'Rowing', sets: 1, reps: '500m' },
      { name: 'Sled Push', sets: 1, reps: '25m' },
      { name: 'Burpee Broad Jumps', sets: 1, reps: '40m' },
      { name: 'Wall Balls', sets: 1, reps: '30' },
      { name: 'Farmers Carry', sets: 1, reps: '100m' },
    ],
  },
  'Hyrox Simulation': {
    Bodyweight: [
      { name: 'Burpee Broad Jumps', sets: 1, reps: '30m' },
      { name: 'Walking Lunges', sets: 1, reps: '50m' },
      { name: 'Squat Jumps', sets: 1, reps: '20' },
      { name: 'Plank Shoulder Taps', sets: 1, reps: '40' },
      { name: 'Mountain Climbers', sets: 1, reps: '40' },
      { name: 'High Knee Run', sets: 1, reps: '200m' },
    ],
    Dumbbells: [
      { name: 'DB Farmers Carry', sets: 1, reps: '100m' },
      { name: 'DB Walking Lunges', sets: 1, reps: '50m' },
      { name: 'DB Thrusters', sets: 1, reps: '15' },
      { name: 'DB Man Makers', sets: 1, reps: '10' },
      { name: 'DB Swings', sets: 1, reps: '20' },
      { name: 'DB Step-Ups', sets: 1, reps: '20' },
    ],
    'Full Gym': [
      { name: 'Rowing', sets: 1, reps: '500m' },
      { name: 'Assault Bike', sets: 1, reps: '3 min' },
      { name: 'Sled Push', sets: 1, reps: '25m' },
      { name: 'Sled Pull', sets: 1, reps: '25m' },
      { name: 'Wall Balls', sets: 1, reps: '25' },
      { name: 'Farmers Carry', sets: 1, reps: '100m' },
    ],
    'Hyrox Equipment': [
      { name: 'SkiErg', sets: 1, reps: '1000m' },
      { name: 'Sled Push', sets: 1, reps: '50m' },
      { name: 'Sled Pull', sets: 1, reps: '50m' },
      { name: 'Burpee Broad Jumps', sets: 1, reps: '80m' },
      { name: 'Rowing', sets: 1, reps: '1000m' },
      { name: 'Farmers Carry', sets: 1, reps: '200m' },
      { name: 'Sandbag Lunges', sets: 1, reps: '100m' },
      { name: 'Wall Balls', sets: 1, reps: '100' },
    ],
  },
};

const RUNNING_POOL = [
  { name: 'Warm-Up Jog', sets: 1, reps: '5 min easy' },
  { name: 'Strides', sets: 1, reps: '4 x 100m' },
  { name: 'Tempo Run', sets: 1, reps: '15 min @ threshold' },
  { name: 'Hill Repeats', sets: 1, reps: '6 x 200m' },
  { name: 'Cool-Down Jog', sets: 1, reps: '5 min easy' },
  { name: 'Stretch & Mobility', sets: 1, reps: '5 min' },
];

const RECOVERY_POOL = [
  { name: 'Foam Rolling', sets: 1, reps: '5 min' },
  { name: 'Hip Flexor Stretch', sets: 1, reps: '60 sec / side' },
  { name: 'Thoracic Rotations', sets: 1, reps: '10 / side' },
  { name: 'Cat-Cow', sets: 1, reps: '10' },
  { name: 'Child’s Pose', sets: 1, reps: '60 sec' },
  { name: 'Box Breathing', sets: 1, reps: '5 min' },
];

function poolFor(focus, equipment) {
  if (focus === 'Running') return RUNNING_POOL;
  if (focus === 'Recovery') return RECOVERY_POOL;
  return EXERCISE_POOLS[focus]?.[equipment] ?? EXERCISE_POOLS.Strength.Bodyweight;
}

export function generateQuickWorkout({ time, equipment, focus }) {
  const pool = poolFor(focus, equipment);
  const count = TIME_TO_COUNT[time] ?? 4;
  const exercises = pool.slice(0, count).map((exercise, index) => ({
    id: `quick-${index}`,
    ...exercise,
  }));

  return {
    title: `${focus} Quick Workout`,
    type: focus === 'Hyrox Simulation' ? 'Hyrox' : focus,
    duration: `${time} min`,
    date: todayISODate(),
    exercises,
  };
}
