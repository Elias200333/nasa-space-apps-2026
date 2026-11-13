# TERRAIN-X Science Package
import os
import sys

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_DATA_ROOT = os.path.abspath(os.path.join(_CURRENT_DIR, "..", ".."))
if _DATA_ROOT not in sys.path:
    sys.path.insert(0, _DATA_ROOT)

