FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci
COPY ui ./ui
COPY trigger_camera ./trigger_camera
RUN cd ui && npm run build

FROM python:3.14-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY Backend ./Backend
COPY --from=frontend /build/ui/dist ./ui/dist
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn main:app --app-dir Backend --host 0.0.0.0 --port \"${PORT:-8000}\""]
