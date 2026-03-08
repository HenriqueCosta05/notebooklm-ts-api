import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "../config/env";
import { notebookLMAuthMiddleware } from "../../presentation/middlewares/notebooklm-auth.middleware";
import { errorMiddleware } from "../../presentation/middlewares/error.middleware";
import { notebooksRouter } from "../../presentation/routes/notebooks.routes";
import { sourcesRouter } from "../../presentation/routes/sources.routes";
import { artifactsRouter } from "../../presentation/routes/artifacts.routes";
import { chatRouter } from "../../presentation/routes/chat.routes";
import { t } from "../../i18n";

export const createApp = (): express.Application => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-notebooklm-auth"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        statusCode: 429,
        error: "TooManyRequests",
        message: t("errors.rate_limited"),
      },
    }),
  );

  app.get(`${config.apiPrefix}/health`, (_req, res) => {
    res.status(200).json({ statusCode: 200, message: t("health.ok") });
  });

  app.use(config.apiPrefix, notebookLMAuthMiddleware);

  app.use(`${config.apiPrefix}/notebooks`, notebooksRouter);
  app.use(`${config.apiPrefix}/notebooks/:notebookId/sources`, sourcesRouter);
  app.use(`${config.apiPrefix}/notebooks/:notebookId/artifacts`, artifactsRouter);
  app.use(`${config.apiPrefix}/notebooks/:notebookId/chat`, chatRouter);

  app.use((_req, res) => {
    res.status(404).json({
      statusCode: 404,
      error: "NotFound",
      message: t("errors.not_found"),
    });
  });

  app.use(errorMiddleware);

  return app;
};
