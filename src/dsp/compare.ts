// Compares two pulse trains by where their pulses begin.

export interface OnsetComparison {
  /** How many samples later the pulses of the second train come, taken from the most common spacing. */
  lag: number;
  /** Pulses found in both, one to one, within the tolerance once the lag is taken out. */
  matched: number;
  onlyA: number;
  onlyB: number;
}

/**
 * Matches the pulse starts of two trains, both in ascending order. The trains
 * may be shifted against each other by up to `maxLag` samples either way; the
 * shift that most pairs agree on is taken out first.
 */
export function compareOnsets(a: ArrayLike<number>, b: ArrayLike<number>, tolerance = 1, maxLag = 0): OnsetComparison {
  let lag = 0;
  if (maxLag > 0) {
    // Count every spacing between a pulse of one train and the pulses near it in the other.
    const votes = new Uint32Array(2 * maxLag + 1);
    let from = 0;
    for (let i = 0; i < a.length; i++) {
      while (from < b.length && b[from] < a[i] - maxLag) from++;
      for (let j = from; j < b.length && b[j] <= a[i] + maxLag; j++) votes[b[j] - a[i] + maxLag]++;
    }
    let most = 0;
    votes.forEach((count, index) => {
      // Of equally common spacings the smallest shift wins.
      if (count > most || (count === most && count > 0 && Math.abs(index - maxLag) < Math.abs(lag))) {
        most = count;
        lag = index - maxLag;
      }
    });
  }

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
