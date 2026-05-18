export type Mode = 'integer' | 'decimal' | 'dice';

export interface Roll {
  value: number;
  mode: Mode;
  min: number;
  max: number;
  at: string;
}

function cryptoRandom(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] ?? 0) / 0xffffffff;
}

export function roll(min: number, max: number, mode: Mode): Roll {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  let value: number;
  if (mode === 'integer' || mode === 'dice') {
    value = Math.floor(cryptoRandom() * (hi - lo + 1)) + lo;
  } else {
    value = cryptoRandom() * (hi - lo) + lo;
  }
  return {
    value,
    mode,
    min: lo,
    max: hi,
    at: new Date().toISOString(),
  };
}

export const DICE_FACES: Record<number, string> = {
  1: 'dice-1',
  2: 'dice-2',
  3: 'dice-3',
  4: 'dice-4',
  5: 'dice-5',
  6: 'dice-6',
};
