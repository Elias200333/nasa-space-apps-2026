"""
TERRAIN-X Main Entry Point
Runs the Planetary Analog Analyzer for Moon or Mars exploration.
"""

import sys, os
_DATA_ROOT = os.path.normpath(os.path.dirname(os.path.abspath(__file__)))
if _DATA_ROOT not in sys.path:
    sys.path.insert(0, _DATA_ROOT)

from analyze_analog import main

if __name__ == "__main__":
    main()

