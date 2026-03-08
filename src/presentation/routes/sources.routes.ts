import { Router } from "express";
import {
  listSources,
  getSource,
  addUrlSource,
  addTextSource,
  addDriveSource,
  deleteSource,
  renameSource,
  refreshSource,
  getSourceGuide,
  getSourceFulltext,
} from "../controllers/sources.controller";

const router = Router({ mergeParams: true });

router.get("/", listSources);
router.get("/:sourceId", getSource);
router.post("/url", addUrlSource);
router.post("/text", addTextSource);
router.post("/drive", addDriveSource);
router.delete("/:sourceId", deleteSource);
router.patch("/:sourceId", renameSource);
router.post("/:sourceId/refresh", refreshSource);
router.get("/:sourceId/guide", getSourceGuide);
router.get("/:sourceId/fulltext", getSourceFulltext);

export { router as sourcesRouter };
