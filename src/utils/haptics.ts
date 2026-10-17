/**
 * Web Vibration API helper for tactile gym floor feedback
 */
export function triggerHaptic(type: 'light' | 'medium' | 'success' | 'warning' = 'light'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;

  try {
    switch (type) {
      case 'light':
        navigator.vibrate(12);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'success':
        // Double pulse for set completion / PR
        navigator.vibrate([15, 40, 25]);
        break;
      case 'warning':
        // Triple pulse for Amber Shield / warning
        navigator.vibrate([30, 40, 30, 40, 50]);
        break;
    }
  } catch (e) {
    // Ignore environments where vibration is restricted
  }
}
