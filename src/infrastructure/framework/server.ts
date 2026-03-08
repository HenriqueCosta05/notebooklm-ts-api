import "reflect-metadata";
import { initI18n } from "../../i18n";
import { createApp } from "./app";
import { config } from "../config/env";

initI18n("en");

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  process.stdout.write(
    `[server] Running at http://${config.host}:${config.port}${config.apiPrefix}\n`,
  );
  process.stdout.write(`[server] Environment: ${config.nodeEnv}\n`);
});

const shutdown = (signal: string): void => {
  process.stdout.write(`\n[server] Received ${signal}. Shutting down gracefully...\n`);
  server.close(() => {
    process.stdout.write("[server] HTTP server closed.\n");
    process.exit(0);
  });

  setTimeout(() => {
    process.stdout.write("[server] Forced shutdown after timeout.\n");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason: unknown) => {
  process.stderr.write(`[server] Unhandled rejection: ${String(reason)}\n`);
  process.exit(1);
});

process.on("uncaughtException", (err: Error) => {
  process.stderr.write(`[server] Uncaught exception: ${err.message}\n`);
  process.exit(1);
});

export { server };
