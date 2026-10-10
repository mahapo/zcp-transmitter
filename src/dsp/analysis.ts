// Measurements on a pulse train (1 during a pulse, else 0).

/** Sample indices at which the pulse train switches on. */
export function onsets(pulses: Float32Array): number[] {
  const found: number[] = [];
  for (let n = 0; n < pulses.length; n++) if (pulses[n] > 0 && !(pulses[n - 1] > 0)) found.push(n);
  return found;
}
