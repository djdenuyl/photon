# Stage 1: build the React app
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src/web src/web
RUN npm run build

# Stage 2: API image serving the built bundle
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-default-groups --no-install-project
COPY src/photon src/photon
COPY main.py ./
RUN uv sync --frozen --no-default-groups
COPY --from=web /app/src/web/dist src/web/dist
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8080
CMD ["python", "main.py"]
