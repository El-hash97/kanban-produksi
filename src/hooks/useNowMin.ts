import { useEffect, useState } from 'react';
import { nowMinOfDay } from '../lib/time';

export function useNowMin(): number {
  const [min, setMin] = useState(() => nowMinOfDay());
  useEffect(() => {
    const id = setInterval(() => setMin(nowMinOfDay()), 15_000);
    return () => clearInterval(id);
  }, []);
  return min;
}
