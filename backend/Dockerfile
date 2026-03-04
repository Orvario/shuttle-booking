FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app/ app/

ENV PORT=8000
EXPOSE ${PORT}

CMD uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
