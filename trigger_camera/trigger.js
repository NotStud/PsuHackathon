// Detects the upward "recoil" flick of a phone held like a pistol.
//
// The flick is a fast rotation that tips the top of the phone back toward the
// shooter. In portrait that is rotation about the device x-axis (rotationRate.beta);
// in landscape it is the y-axis (rotationRate.gamma). An up or down flick fires, but
// only if it is mostly pitch: swinging the phone side to side or twisting it doesn't
// shoot. We also remember when the phone was last steady, so the camera can hand
// hit detection the sharp frame from just before the flick instead of a blurred one.

// The one place the default flick sensitivity lives; the slider reads it from here.
export const DEFAULT_THRESHOLD = 35;  // deg/s of up/down pitch that counts as the flick

// Per the DeviceMotion spec, the top of the phone tipping back toward you is positive.
// If a phone reports upward flicks as negative, flip this to -1.
const UP = 1;

// true = only upward flicks fire; false = up or down.
const UP_ONLY = false;

// The up/down pitch must be at least this many times faster than any sideways
// rotation. Higher = side-to-side motion is less likely to shoot.
const DOMINANCE = 2.5;

// After any mostly-sideways motion, shooting is locked out for this long, so the
// tail end of a left/right swing (where tilt can briefly outweigh the side motion)
// can't fire.
const SIDE_LOCKOUT_MS = 400;

export class FlickTrigger {
  constructor({
    threshold = DEFAULT_THRESHOLD,
    quiet = 70,        // deg/s of total rotation below which the phone is "steady"
    onFire = () => {},
    onSample = () => {},
  } = {}) {
    Object.assign(this, { threshold, quiet, onFire, onSample });
    this.armed = false;
    this.hasSensor = false;
    this.lastQuietAt = null;
    this.lastSideAt = -Infinity;
    this._onMotion = this._onMotion.bind(this);
    window.addEventListener('devicemotion', this._onMotion);
  }

  // iOS only grants motion access from inside a user gesture (e.g. a button tap).
  static async requestPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') throw new Error('Motion permission was denied.');
    }
  }

  arm() {
    this.armed = true;
    this.lastQuietAt = null;
  }

  disarm() {
    this.armed = false;
  }

  destroy() {
    window.removeEventListener('devicemotion', this._onMotion);
  }

  // Splits rotation into upward pitch (positive = muzzle up) and the strongest
  // sideways rotation, for however the screen is currently turned.
  _axes(r) {
    const a = r.alpha ?? 0, b = r.beta ?? 0, g = r.gamma ?? 0;
    const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    switch ((angle + 360) % 360) {
      case 90: return { pitch: -g * UP, side: Math.max(Math.abs(a), Math.abs(b)) };
      case 270: return { pitch: g * UP, side: Math.max(Math.abs(a), Math.abs(b)) };
      case 180: return { pitch: -b * UP, side: Math.max(Math.abs(a), Math.abs(g)) };
      default: return { pitch: b * UP, side: Math.max(Math.abs(a), Math.abs(g)) };
    }
  }

  _onMotion(e) {
    const r = e.rotationRate;
    if (!r || r.beta == null) return;
    this.hasSensor = true;

    const now = performance.now();
    const { pitch, side } = this._axes(r);
    const total = Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0);
    // "Steady" must stay well below the trigger point, or a gentle flick would count as steady.
    const steady = total < Math.min(this.quiet, this.threshold / 2);

    if (steady) this.lastQuietAt = now;
    if (side >= this.threshold && side > Math.abs(pitch)) this.lastSideAt = now;
    const sideLocked = now - this.lastSideAt < SIDE_LOCKOUT_MS;
    this.onSample({ pitch, side, total, steady, sideLocked });

    const flick = UP_ONLY ? pitch : Math.abs(pitch);
    if (this.armed && !sideLocked && flick >= this.threshold && flick >= DOMINANCE * side) {
      // Never reach back more than 250 ms for the photo, or it may predate the aim.
      const steadyAt = Math.max(this.lastQuietAt ?? now, now - 250);
      this._fire({ firedAt: now, steadyAt, peakRate: pitch });
    }
  }

  _fire(info) {
    this.armed = false;
    this.onFire(info);
  }
}
