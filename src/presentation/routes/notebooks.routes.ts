import { Router } from "express";
import {
  listNotebooks,
  getNotebook,
  createNotebook,
  deleteNotebook,
  renameNotebook,
  getNotebookDescription,
  shareNotebook,
} from "../controllers/notebooks.controller";

const router = Router();

router.get("/", listNotebooks);
router.post("/", createNotebook);
router.get("/:id", getNotebook);
router.delete("/:id", deleteNotebook);
router.patch("/:id", renameNotebook);
router.get("/:id/description", getNotebookDescription);
router.post("/:id/share", shareNotebook);

export { router as notebooksRouter };
