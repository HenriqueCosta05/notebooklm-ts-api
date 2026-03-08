import { Router } from "express";
import {
  listArtifacts,
  getArtifact,
  generateAudio,
  generateVideo,
  generateReport,
  generateQuiz,
  generateFlashcards,
  generateInfographic,
  generateSlideDeck,
  generateDataTable,
  generateMindMap,
  pollArtifactStatus,
  deleteArtifact,
  renameArtifact,
  exportArtifact,
  suggestReports,
  reviseSlide,
} from "../controllers/artifacts.controller";

const router = Router({ mergeParams: true });

router.get("/", listArtifacts);
router.get("/suggestions", suggestReports);
router.get("/:artifactId", getArtifact);
router.delete("/:artifactId", deleteArtifact);
router.patch("/:artifactId", renameArtifact);
router.post("/:artifactId/export", exportArtifact);
router.post("/:artifactId/revise-slide", reviseSlide);

router.post("/generate/audio", generateAudio);
router.post("/generate/video", generateVideo);
router.post("/generate/report", generateReport);
router.post("/generate/quiz", generateQuiz);
router.post("/generate/flashcards", generateFlashcards);
router.post("/generate/infographic", generateInfographic);
router.post("/generate/slide-deck", generateSlideDeck);
router.post("/generate/data-table", generateDataTable);
router.post("/generate/mind-map", generateMindMap);

router.get("/status/:taskId", pollArtifactStatus);

export { router as artifactsRouter };
