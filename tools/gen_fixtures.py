#!/usr/bin/env python3
# Dumps the FIR taps GNU Radio designs for every slider position of the app,
# as the reference for tests/firdes.test.ts.  Needs GNU Radio:
#
#   /opt/homebrew/bin/python3 tools/gen_fixtures.py > tests/fixtures/firdes.json

import json
import sys

from gnuradio.fft import window
from gnuradio.filter import firdes

SR = 48000
HAMMING = window.WIN_HAMMING


def taps(values):
    return [float(v) for v in values]


json.dump({
    'high_pass': {str(hz): taps(firdes.high_pass(1, SR, hz, 50, HAMMING, 6.76))
                  for hz in range(80, 161, 20)},
    'low_pass': {str(hz): taps(firdes.low_pass(1, SR, hz, 200, HAMMING, 6.76))
                 for hz in range(900, 3601, 100)},
    'band_pass': taps(firdes.band_pass(1, SR, 300, 900, 100, HAMMING, 6.76)),
}, sys.stdout)
