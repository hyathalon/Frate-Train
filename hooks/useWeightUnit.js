import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'weightUnit';

/** Shared kg/lbs preference, persisted to AsyncStorage so every screen agrees. */
export function useWeightUnit() {
  const [unit, setUnitState] = useState('kg');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'kg' || stored === 'lbs') {
          setUnitState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setUnit = useCallback((nextUnit) => {
    setUnitState(nextUnit);
    AsyncStorage.setItem(STORAGE_KEY, nextUnit).catch(() => {});
  }, []);

  return [unit, setUnit];
}
