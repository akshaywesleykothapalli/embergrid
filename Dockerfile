FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8765 \
    EMBERGRID_GLOBAL_ARCHIVE=/data/fire-harmony-v1 \
    EMBERGRID_GLOBAL_ARCHIVE_URL=https://huggingface.co/datasets/warrensaw530/fire-harmony/resolve/9c1c703472d727d9f9b42477df39440bb34b2b64/v1.0 \
    EMBERGRID_DUCKDB_EXTENSION_DIRECTORY=/opt/duckdb/extensions

WORKDIR /app
COPY backend/requirements-global.txt backend/
RUN pip install --no-cache-dir -r backend/requirements-global.txt
COPY backend/install_httpfs.py backend/
RUN python backend/install_httpfs.py
COPY backend/ backend/
COPY frontend/ frontend/

USER 10001:10001
EXPOSE 8765
CMD ["python", "backend/server.py", "--host", "0.0.0.0"]
