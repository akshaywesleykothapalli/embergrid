FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8765 \
    EMBERGRID_GLOBAL_ARCHIVE=/data/fire-harmony-v1

WORKDIR /app
COPY backend/requirements-global.txt backend/
RUN pip install --no-cache-dir -r backend/requirements-global.txt
COPY backend/ backend/
COPY frontend/ frontend/

USER 10001:10001
EXPOSE 8765
CMD ["python", "backend/server.py", "--host", "0.0.0.0"]
