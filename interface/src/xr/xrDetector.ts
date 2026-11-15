/**
 * Detector de dispositivos de Realidad Virtual (WebXR) y gestión de modo XR
 * =========================================================================
 * Detecta si la aplicación se abre en un visor VR / XR:
 * - Meta Quest (OculusBrowser)
 * - Apple Vision Pro
 * - Pico 4 / Pico Neo
 * - HTC Vive / SteamVR / WebXR
 * - Forzado mediante parámetro de URL: ?vr=1 o ?xr=1 (ideal para pruebas en cualquier PC)
 */

export class XRDetector {
  /**
   * Comprueba si la aplicación está ejecutándose en un visor VR o si se solicitó modo XR
   */
  public static async isVRDeviceOrRequested(): Promise<boolean> {
    // 1. Parámetro explícito en la URL (?vr=1, ?xr=1, ?mr=1, ?ar=1 o ?mode=vr)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('vr') === '1' || params.get('xr') === '1' || params.get('mr') === '1' || params.get('ar') === '1' || params.get('mode') === 'vr') {
        return true;
      }
    }

    // 2. Detección por User-Agent de visores XR conocidos (Meta Quest, Pico, Vision Pro)
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      const isHeadsetUA = /OculusBrowser|Quest|Pico|Vive|VisionPro|XR|VR|MobileVR/i.test(ua);
      if (isHeadsetUA) {
        return true;
      }
    }

    return false;
  }

  /**
   * Comprueba si el navegador tiene soporte nativo para WebXR (immersive-ar o immersive-vr)
   */
  public static async hasWebXRSupport(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && (navigator as any).xr && typeof (navigator as any).xr.isSessionSupported === 'function') {
      try {
        const isAR = await (navigator as any).xr.isSessionSupported('immersive-ar').catch(() => false);
        const isVR = await (navigator as any).xr.isSessionSupported('immersive-vr').catch(() => false);
        return isAR || isVR;
      } catch {
        return false;
      }
    }
    return false;
  }
}

