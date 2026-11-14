#!/usr/bin/env python3
"""
TERRAIN-X Python Environment Diagnostic
========================================
Run this script from the Antigravity IDE to see which Python
interpreter the IDE is using and what packages are available.
"""
import sys
import os

print("=" * 60)
print(" TERRAIN-X PYTHON ENVIRONMENT DIAGNOSTIC")
print("=" * 60)
print()
print(f"Python executable : {sys.executable}")
print(f"Python version    : {sys.version}")
print(f"Working directory : {os.getcwd()}")
print(f"Script location   : {os.path.abspath(__file__)}")
print()

# Check if we're in a virtual environment
venv = os.environ.get("VIRTUAL_ENV", "(none)")
print(f"VIRTUAL_ENV       : {venv}")
print()

# Check sys.path
print("sys.path:")
for i, p in enumerate(sys.path):
    print(f"  [{i}] {p}")
print()

# Check key packages
packages = [
    "numpy", "scipy", "rasterio", "pyproj", "shapely",
    "tifffile", "requests", "pydantic", "fastapi", "uvicorn",
    "pytest", "matplotlib", "httpx"
]
print("Package availability:")
for pkg in packages:
    try:
        mod = __import__(pkg)
        version = getattr(mod, "__version__", "unknown")
        print(f"  ✅ {pkg:15s} -> {version}")
    except ImportError as e:
        print(f"  ❌ {pkg:15s} -> NOT FOUND ({e})")

print()
print("=" * 60)
print(" If you see ❌ marks above, the IDE is using a Python")
print(" that doesn't have the required packages installed.")
print(" The fix: install packages into THIS Python with:")
print(f'   "{sys.executable}" -m pip install -r requirements.txt')
print("=" * 60)
