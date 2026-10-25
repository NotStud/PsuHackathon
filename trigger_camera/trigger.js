// Detects the upward "recoil" flick of a phone held like a pistol.
//
// The flick is a fast rotation that tips the top of the phone back toward the
// shooter. In portrait that is rotation about the device x-axis (rotationRate.beta);
// in landscape it is the y-axis (rotationRate.gamma). Only up/down speed decides the
// shot. Side-to-side motion and twisting never fire it, and don't block it either,
// as long as the motion is mostly up/down. We also remember when the phone was last
// steady, so the camera can hand hit detection the sharp frame from just before the
// flick instead of a blurred one.

// The one place the default flick sensitivity lives; the slider reads it from here.
export const DEFAULT_THRESHOLD = 70;  // deg/s of up/down flick speed that shoots

// Per the DeviceMotion spec, the top of the phone tipping back toward you is positive.
// If a phone reports upward flicks as negative, flip this to -1.
const UP = 1;

// true = only upward flicks fire; false = up or down.
const UP_ONLY = false;

// The motion counts as a flick only if up/down is at least this many times the
// sideways speed (1 = up/down just has to be the majority). Raise it to be stricter.
const MAJORITY = 1.5;

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
    this.gravity = null;  // smoothed accelerationIncludingGravity, tells us how the phone is held
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

  // Splits rotation into up/down pitch (positive = muzzle up) and everything else
  // (side-to-side swing plus twist). The pitch axis comes from gravity, so it is right
  // however the phone is held, even sideways with rotation lock on, where the screen
  // orientation would claim portrait and swap up/down with left/right.
  _axes(r) {
    const w = { x: r.beta ?? 0, y: r.gamma ?? 0, z: r.alpha ?? 0 };  // deg/s about device x, y, z
    const total = Math.hypot(w.x, w.y, w.z);
    const g = this.gravity;
    const flat = g ? Math.hypot(g.x, g.y) : 0;
    let pitch;
    if (g && flat > 0.5 * Math.hypot(g.x, g.y, g.z)) {
      // Phone roughly upright: the pitch axis is horizontal and across the camera's
      // view, i.e. perpendicular to both gravity and the camera (device z) axis.
      pitch = (w.x * g.y - w.y * g.x) / flat * UP;
    } else {
      // No gravity reading, or camera pointing at the floor/sky: fall back to the screen.
      const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      pitch = { 90: -w.y, 180: -w.x, 270: w.y }[(angle + 360) % 360] ?? w.x;
      pitch *= UP;
    }
    return { pitch, side: Math.sqrt(Math.max(0, total * total - pitch * pitch)) };
  }

  _trackGravity(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    // Smooth heavily so the jolt of a flick doesn't swing the estimate.
    const k = this.gravity ? 0.1 : 1;
    const g = this.gravity || { x: 0, y: 0, z: 0 };
    this.gravity = { x: g.x + (a.x - g.x) * k, y: g.y + (a.y - g.y) * k, z: g.z + (a.z - g.z) * k };
  }

  _onMotion(e) {
    const r = e.rotationRate;
    if (!r || r.beta == null) return;
    this.hasSensor = true;

    const now = performance.now();
    this._trackGravity(e);
    const { pitch, side } = this._axes(r);
    const total = Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0);
    // "Steady" must stay well below the trigger point, or a gentle flick would count as steady.
    const steady = total < Math.min(this.quiet, this.threshold / 2);

    if (steady) this.lastQuietAt = now;
    // The HUD meter shows this same number, so a full bar always means a shot.
    const mostlyUpDown = Math.abs(pitch) >= MAJORITY * side && !(UP_ONLY && pitch <= 0);
    const strength = mostlyUpDown ? Math.abs(pitch) : 0;
    this.onSample({ pitch, side, total, steady, strength });

    if (this.armed && strength >= this.threshold) {
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
