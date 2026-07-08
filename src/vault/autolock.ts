/**
 * Auto-lock on background is intentionally DISABLED.
 *
 * Product decision: switching tabs or apps (getting distracted) must never
 * kick the user back to login. The vault now locks only on an explicit action
 * — the "Lock" button or logout — and, on native, whenever the app process is
 * fully closed and reopened (the fingerprint prompt guards that first open).
 *
 * Privacy while backgrounded is still handled by `LockOverlay`, which covers
 * the screen in the app switcher WITHOUT ending the session.
 *
 * Kept as a no-op (rather than removed) so the root layout wiring and its
 * unsubscribe contract stay unchanged.
 */
export function startAutolock(): () => void {
  return () => {};
}
