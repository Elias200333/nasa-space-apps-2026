"""
TERRAIN-X Test Configuration
=============================
Automatically adds the project 'data/' directory to sys.path so that
all test files can import 'modules.*' and 'fixtures.*' regardless
of which directory the test runner is invoked from.

This file is loaded automatically by pytest before any test module.
"""

import sys
import os

# The 'data/' directory is the parent of this 'tests/' folder
_DATA_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

if _DATA_ROOT not in sys.path:
    sys.path.insert(0, _DATA_ROOT)
