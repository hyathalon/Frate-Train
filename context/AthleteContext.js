import { createContext, useContext, useState } from 'react';

const AthleteContext = createContext(null);

export function AthleteProvider({ children }) {
  const [athleteType, setAthleteType] = useState('hyrox');
  return (
    <AthleteContext.Provider value={{ athleteType, setAthleteType }}>
      {children}
    </AthleteContext.Provider>
  );
}

export function useAthlete() {
  const context = useContext(AthleteContext);
  if (!context) {
    throw new Error('useAthlete must be used within an AthleteProvider');
  }
  return context;
}

export function getBrandName(athleteType) {
  if (athleteType === 'hyrox' || athleteType === 'hyathlon') return 'Hyathlon Performance';
  return 'Frate Train Coaching';
}
