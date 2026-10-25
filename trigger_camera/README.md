# Trigger + Camera

Mobile web page: rear-camera viewfinder with a crosshair. Tap **Start** and it's armed (recording) right away: aim at a target, then flick the phone muzzle-up like recoil to shoot. After the shot a **kill cam** plays on its own (no tap needed) and loops: the last 2 s before the shot at normal speed, then slow motion from the shot to the end, with a hit marker on the crosshair (`killcam.js`). Nothing uploads until the player taps **Send** (one shot, one send; **Retry** appears if the upload fails). **Back to start** returns to the camera preview (not recording) with the Start button.

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

- Watches gyro pitch rate: rotation about the axis that's horizontal and across the camera's view, worked out from gravity, so it's correct however the phone is held (including sideways with rotation lock on). Falls back to the screen orientation if there's no gravity reading. Everything else (side-to-side swing, twist) is "side".
- Only up/down speed decides the shot (set `UP_ONLY = true` for up only). If the motion is mostly up/down (`|pitch| ≥ MAJORITY × side`, with `MAJORITY = 1.5`), strength is the up/down speed and any sideways part is ignored; if it's mostly sideways, strength is 0, so side-to-side and twisting never fire. The HUD meter shows this same strength, so a full bar always fires. If a phone reports upward as negative, flip `UP` to `-1` in `trigger.js`.
- Fires whenever strength exceeds the threshold. The default is `DEFAULT_THRESHOLD` in `trigger.js` (70°/s), the only place it's set; the slider adjusts it from 20 to 360.
- It tracks the last moment the phone was steady (<70°/s total) and uses the frame from then, so the photo isn't blurred by the flick.
- Shooting is flick-only: there is no tap-to-fire, so it needs a phone with a gyro.
