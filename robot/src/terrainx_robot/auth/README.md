# Cryptographic Authentication & AES Management (`robot/src/terrainx_robot/auth`)

## Overview
This module manages AES-128 cryptographic keys required for establishing encrypted data channel sessions with Unitree Go2 robots.

---

## Files & Engineering Logic

### `aes_key_manager.py`
- **Role**: Key persistence, masking, and validation.
- **Key Logic**:
  - Securely reads, validates, and stores the 32-character hexadecimal AES-128 key.
  - Automatically computes a non-reversible SHA-256 fingerprint (e.g. `sha256:9884dda4`) to verify key configuration in telemetry without exposing the raw secret.
  - Implements key derivation functions and masked string representations for diagnostic logging.
