// Compares two pulse trains by where their pulses begin.

export interface OnsetComparison {
  /** How many samples later the pulses of the second train come, taken from the most common spacing. */
  lag: number;
  /** Pulses found in both, one to one, within the tolerance once the lag is taken out. */
  matched: number;
  onlyA: number;
  onlyB: number;
}

/** The shift of `b` against `a`, up to `maxLag` either way, that most pairs of pulses agree on. */
function commonLag(a: ArrayLike<number>, b: ArrayLike<number>, maxLag: number): number {
  // Count every spacing between a pulse of one train and the pulses near it in the other.
  const votes = new Uint32Array(2 * maxLag + 1);
  let from = 0;
  for (let i = 0; i < a.length; i++) {
    while (from < b.length && b[from] < a[i] - maxLag) from++;
    for (let j = from; j < b.length && b[j] <= a[i] + maxLag; j++) votes[Math.round(b[j] - a[i]) + maxLag]++;
  }
  let lag = 0;
  let most = 0;
  votes.forEach((count, index) => {
    // Of equally common spacings the smallest shift wins.
    if (count > most || (count === most && count > 0 && Math.abs(index - maxLag) < Math.abs(lag))) {
      most = count;
      lag = index - maxLag;
    }
  });
  return lag;
}

/**
 * Matches the pulse starts of two trains, both in ascending order. The trains
 * may be shifted against each other by up to `maxLag` samples either way; the
 * shift that most pairs agree on is taken out first.
 */
export function compareOnsets(a: ArrayLike<number>, b: ArrayLike<number>, tolerance = 1, maxLag = 0): OnsetComparison {
  const lag = maxLag > 0 ? commonLag(a, b, maxLag) : 0;
  let matched = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const difference = b[j] - lag - a[i];
    if (Math.abs(difference) <= tolerance) {
      matched++;
      i++;
      j++;
    } else if (difference < 0) j++;
    else i++;
  }
  return { lag, matched, onlyA: a.length - matched, onlyB: b.length - matched };
}

/**
 * Compares what was sent with what came back, when what came back is a longer
 * record that begins and ends at other times. The delay is found as in
 * compareOnsets; then only what was received while `sent` was arriving counts,
 * so pulses from before or after it are not taken for extra ones.
 */
export function compareLoopback(sent: ArrayLike<number>, received: ArrayLike<number>, tolerance: number, maxLag: number): OnsetComparison {
  if (sent.length === 0) return { lag: 0, matched: 0, onlyA: 0, onlyB: 0 };
  const lag = commonLag(sent, received, maxLag);
  const from = sent[0] + lag - tolerance;
  const to = sent[sent.length - 1] + lag + tolerance;
  const during = Array.from(received).filter((at) => at >= from && at <= to);
  return { ...compareOnsets(sent, during.map((at) => at - lag), tolerance), lag };
}
