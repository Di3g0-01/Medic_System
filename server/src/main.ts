import type { AppDeps } from "./application/context.ts";
import { loadConfig, type AppConfig } from "./config.ts";
import { buildContainer } from "./container.ts";
import { systemClock } from "./domain/values.ts";
import { createApp } from "./http/app.ts";

export function buildDeps(config: AppConfig) {
  const container = buildContainer(config);
  const deps: AppDeps = {
    resolver: container.factory,
    auth: container.central,
    users: container.central,
    institutions: container.central,
    audit: container.central,
    hasher: container.hasher,
    clock: systemClock,
    initialUserPassword: config.initialUserPassword,
  };
  return { container, deps };
}

export function buildServer(config = loadConfig()) {
  const { container, deps } = buildDeps(config);
  const app = createApp(deps, { jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn, corsOrigin: config.corsOrigin });
  return { app, container, deps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const { app, container } = buildServer(config);
  const server = app.listen(config.port, () => console.log(`Red Clínica API escuchando en http://localhost:${config.port}/api`));
  const shutdown = () => server.close(() => container.close().finally(() => process.exit(0)));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
