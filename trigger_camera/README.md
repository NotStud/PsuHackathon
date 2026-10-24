# Trigger + Camera

Mobile web page: rear-camera viewfinder with a crosshair. Tap **Start** and it's armed (recording) right away: aim at a target, then flick the phone muzzle-up like recoil to shoot. After the shot a **kill cam** plays on its own (no tap needed) and loops: the last 2 s before the shot, in slow motion around the trigger, with a hit marker on the crosshair (`killcam.js`). **Next shot** re-arms.

## Run it on your phone

```
python serve.py
```

Open the printed `https://<ip>:8443` on a phone on the same Wi-Fi and accept the certificate warning. HTTPS is required for camera and motion access.

## What a shot sends

`POST /shot` (multipart/form-data). Change the URL with `?endpoint=https://...`.

| field   | content |
|---------|---------|
| `frame` | JPEG (≤960px wide) from just **before** the flick, so it isn't motion-blurred. This is what hit detection should judge. |
| `clip`  | Video from arming to 0.8 s after the shot (`mp4` on iOS, `webm` on Android). Evidence and replay. |
| `meta`  | JSON: `request_id`, `fired_at` (epoch ms), `aim` `{x,y}` as a fraction of the frame (always center), `frame_lead_ms`, `peak_rate` |

Respond with `{"hit": true, "target": "name"}`, `{"hit": false}`, or `{"hit": null}` (saved, not judged) and the page shows the verdict.

`request_id` maps directly onto `Game.record_hit(..., request_id=...)` on the GameLogic branch.

## How the trigger works (`trigger.js`)

- Watches gyro pitch rate (`rotationRate.beta` in portrait, `gamma` in landscape).
- An **up or down** flick fires (set `UP_ONLY = true` for up only), and only if the pitch is at least 2.5× any sideways rotation (`DOMINANCE`), so side swings and twists don't shoot. After any mostly-sideways motion, shooting is also locked for 0.4 s (`SIDE_LOCKOUT_MS`), so the tail end of a swing can't fire. If a phone reports upward as negative, flip `UP` to `-1` in `trigger.js`.
- Fires whenever pitch exceeds the threshold. The default is `DEFAULT_THRESHOLD` in `trigger.js` (35°/s), the only place it's set; the slider adjusts it from 20 to 360.
- It tracks the last moment the phone was steady (<70°/s total) and uses the frame from then, so the photo isn't blurred by the flick.
- Shooting is flick-only: there is no tap-to-fire, so it needs a phone with a gyro.
