"""
Camera + hit detection prototype (role: computer vision).
 
Setup:
    pip install opencv-python ultralytics
 
Run:
    python hit_detection.py
 
Controls:
    SPACE = fake a "shot" event (stands in for the sensor/trigger person's flick)
    Q     = quit
 
What it does:
    1. Reads webcam frames and keeps the last ~0.5s in a ring buffer.
    2. On a shot event, grabs the frame from just BEFORE the flick started.
    3. Runs a pretrained person detector (YOLOv8 nano) on that frame.
    4. HIT if the center crosshair is inside a person's bounding box, else MISS.
    5. Saves the annotated frame so the backend/UI can show it for confirm/dispute.
"""
 
import time
from collections import deque
 
import cv2
from ultralytics import YOLO
 
BUFFER_SECONDS = 0.5      # how much history to keep
FLICK_LEAD_TIME = 0.3     # fake "flick started this long before the shot event"
CONF_THRESHOLD = 0.4      # detector confidence cutoff (tune this)
MARGIN_PX = 10            # forgiveness around the box edges (tune this)
MIN_BOX_HEIGHT_FRAC = 0.15  # ignore tiny boxes = limits max range (tune this)
RESULT_DISPLAY_SECONDS = 1.5
 
model = YOLO("yolov8n.pt")  # downloads automatically on first run
frame_buffer = deque()      # items are (timestamp, frame)
 
 
def add_frame(frame):
    now = time.monotonic()
    frame_buffer.append((now, frame))
    while frame_buffer and now - frame_buffer[0][0] > BUFFER_SECONDS:
        frame_buffer.popleft()
 
 
def frame_before(timestamp):
    """Return the newest buffered frame at or before `timestamp`
    (falls back to the oldest frame we have)."""
    chosen = frame_buffer[0]
    for ts, frame in frame_buffer:
        if ts <= timestamp:
            chosen = (ts, frame)
        else:
            break
    return chosen
 
 
def check_hit(frame):
    """Return (hit, annotated_frame, info)."""
    h, w = frame.shape[:2]
    cx, cy = w // 2, h // 2
    result = model(frame, classes=[0], conf=CONF_THRESHOLD, verbose=False)[0]  # class 0 = person
 
    annotated = frame.copy()
    best = None
    for box in result.boxes:
        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
        conf = float(box.conf[0])
        big_enough = (y2 - y1) >= MIN_BOX_HEIGHT_FRAC * h
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 255), 2)
        inside = (x1 - MARGIN_PX <= cx <= x2 + MARGIN_PX and
                  y1 - MARGIN_PX <= cy <= y2 + MARGIN_PX)
        if inside and big_enough and (best is None or conf > best["conf"]):
            best = {"conf": conf, "box": (x1, y1, x2, y2)}
 
    if best:
        x1, y1, x2, y2 = best["box"]
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 3)
 
    draw_crosshair(annotated)
    return best is not None, annotated, best
 
 
def draw_crosshair(img, color=(0, 0, 255)):
    h, w = img.shape[:2]
    cx, cy = w // 2, h // 2
    cv2.line(img, (cx - 20, cy), (cx + 20, cy), color, 2)
    cv2.line(img, (cx, cy - 20), (cx, cy + 20), color, 2)
    cv2.circle(img, (cx, cy), 12, color, 1)
 
 
def on_shot_event(shot_time):
    """Called when the trigger fires. Returns result dict for backend/UI."""
    flick_start = shot_time - FLICK_LEAD_TIME
    ts, frame = frame_before(flick_start)
    hit, annotated, info = check_hit(frame)
    filename = f"shot_{int(time.time())}.jpg"
    cv2.imwrite(filename, annotated)
    return {
        "hit": hit,
        "confidence": info["conf"] if info else None,
        "bbox": info["box"] if info else None,
        "frame_timestamp": ts,
        "image_path": filename,
    }
 
 
def main():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam")
 
    last_result = None
    result_until = 0.0
 
    while True:
        ok, frame = cap.read()
        if not ok:
            break
 
        add_frame(frame.copy())
 
        display = frame.copy()
        draw_crosshair(display)
 
        if last_result and time.monotonic() < result_until:
            label = "HIT" if last_result["hit"] else "MISS"
            color = (0, 255, 0) if last_result["hit"] else (0, 0, 255)
            cv2.putText(display, label, (30, 70), cv2.FONT_HERSHEY_SIMPLEX, 2, color, 4)
 
        cv2.imshow("hit detection (SPACE = shoot, Q = quit)", display)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" "):
            last_result = on_shot_event(time.monotonic())
            result_until = time.monotonic() + RESULT_DISPLAY_SECONDS
            print(last_result)
 
    cap.release()
    cv2.destroyAllWindows()
 
 
if __name__ == "__main__":
    main()