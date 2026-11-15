#!/bin/sh
cd "$(dirname "$0")" || exit 1
runtime=python3
if [ -x .venv/bin/python ]; then
    runtime=.venv/bin/python
fi
exec "$runtime" backend/server.py "$@"
