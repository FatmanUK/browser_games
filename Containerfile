# Serves the static site via tools/dev_server.py (Python
# stdlib only, no extra dependencies) -- no build step, same
# as local dev (see Makefile's `run` target).

FROM python:3.12-slim

WORKDIR /app
COPY . .

RUN useradd -u 1000 appuser
USER appuser

EXPOSE 8000
CMD ["python3", "tools/dev_server.py", "8000"]
