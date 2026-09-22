import { createContext, useContext, useState } from 'react';
import { daysUntil, formatDate } from '../utils/date';

const RaceContext = createContext(null);

const initialRace = {
  name: 'HYROX Melbourne',
  date: '2026-11-03',
  type: 'Hyrox',
  location: 'Melbourne, AU',
};

export function RaceProvider({ children }) {
  const [race, setRace] = useState(initialRace);
  return <RaceContext.Provider value={{ race, setRace }}>{children}</RaceContext.Provider>;
}

export function useRace() {
  const context = useContext(RaceContext);
  if (!context) {
    throw new Error('useRace must be used within a RaceProvider');
  }
  return context;
}

export { daysUntil };
export const formatRaceDate = formatDate;
