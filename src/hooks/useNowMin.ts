import { useEffect, useState } from 'react';
import type { ShiftConfig } from '../domain/types';
import { nowMinForShift } from '../lib/time';

export function useNowMin(shift: ShiftConfig): number {
  const [min, setMin] = useState(() => nowMinForShift(shift));
  useEffect(() => {
    const id = setInterval(() => setMin(nowMinForShift(shift)), 15_000);
    return () => clearInterval(id);
  }, [shift]);
  return min;
}
