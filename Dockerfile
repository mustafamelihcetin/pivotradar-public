# --- Stage 1: Build the React Frontend ---
FROM node:20-alpine as build-stage
WORKDIR /app/frontend
COPY frontend/package*.json ./
ARG CACHE_BREAK_V3=4.5.0
# Frontend build-time vars — passed as --build-arg, never baked from .env file
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_API_BASE=""
ARG VITE_TURNSTILE_SITE_KEY="0x4AAAAAAADJqA9fCDS2kBUGS"
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN chmod -R +x node_modules/.bin
RUN VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
    VITE_API_BASE="$VITE_API_BASE" \
    VITE_TURNSTILE_SITE_KEY="0x4AAAAAAADJqA9fCDS2kBUGS" \
    npm run build

# --- Stage 2: Python Backend Runtime ---
FROM python:3.11-slim-bullseye
WORKDIR /app

# Create a non-privileged user BEFORE using it in COPY --chown
RUN groupadd -r pivotuser && useradd -r -g pivotuser -m -d /home/pivotuser pivotuser

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    mime-support \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY --chown=pivotuser:pivotuser ./backend /app/backend

# Copy built frontend from build-stage
RUN mkdir -p /app/static /app/data/runtime /app/models /app/assets
COPY --from=build-stage --chown=pivotuser:pivotuser /app/frontend/dist /app/static/react

# Ensure everything is owned by pivotuser
RUN chown -R pivotuser:pivotuser /app

ENV PYTHONPATH=/app/backend
ENV ENVIRONMENT=production
ENV PYTHONUNBUFFERED=1

USER pivotuser

EXPOSE 8051

# Start the application using Gunicorn
CMD ["sh", "-c", "cd /app/backend && python -m app.init && gunicorn --config /app/backend/gunicorn.conf.py app.main:app"]
