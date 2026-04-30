import { Router } from "express";
import {
  startResearch,
  getResearchStatus,
  importResearchResults,
  waitForResearchCompletion,
} from "../controllers/research.controller";

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /notebooks/{notebookId}/research:
 *   post:
 *     summary: Start a research task
 *     tags:
 *       - Research
 *     parameters:
 *       - name: notebookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Research query
 *               mode:
 *                 type: string
 *                 enum: ['fast', 'deep']
 *                 default: 'fast'
 *     responses:
 *       201:
 *         description: Research task started
 */
router.post("/:notebookId/research", startResearch);

/**
 * @openapi
 * /notebooks/{notebookId}/research/{taskId}:
 *   get:
 *     summary: Get research task status
 *     tags:
 *       - Research
 *     parameters:
 *       - name: notebookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.get("/:notebookId/research/:taskId", getResearchStatus);

/**
 * @openapi
 * /notebooks/{notebookId}/research/{taskId}/import:
 *   post:
 *     summary: Import research results
 *     tags:
 *       - Research
 *     parameters:
 *       - name: notebookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.post("/:notebookId/research/:taskId/import", importResearchResults);

/**
 * @openapi
 * /notebooks/{notebookId}/research/{taskId}/wait:
 *   get:
 *     summary: Wait for research completion
 *     tags:
 *       - Research
 *     parameters:
 *       - name: notebookId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: timeoutMs
 *         in: query
 *         schema:
 *           type: number
 */
router.get("/:notebookId/research/:taskId/wait", waitForResearchCompletion);

export { router as researchRouter };
