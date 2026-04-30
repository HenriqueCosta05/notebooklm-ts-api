import { Router } from "express";
import {
  getShareStatus,
  setPublic,
  addUser,
  removeUser,
  updatePermission,
  getSharedUsers,
  getShareUrl,
} from "../controllers/sharing.controller";

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /notebooks/{id}/share:
 *   get:
 *     summary: Get notebook share status
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Share status
 */
router.get("/:id/share", getShareStatus);

/**
 * @openapi
 * /notebooks/{id}/share/public:
 *   patch:
 *     summary: Set notebook public/private
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
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
 *               isPublic:
 *                 type: boolean
 */
router.patch("/:id/share/public", setPublic);

/**
 * @openapi
 * /notebooks/{id}/share/users:
 *   post:
 *     summary: Add user to notebook
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
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
 *               email:
 *                 type: string
 *               permission:
 *                 type: number
 */
router.post("/:id/share/users", addUser);

/**
 * @openapi
 * /notebooks/{id}/share/users:
 *   delete:
 *     summary: Remove user from notebook
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
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
 *               email:
 *                 type: string
 */
router.delete("/:id/share/users", removeUser);

/**
 * @openapi
 * /notebooks/{id}/share/users/permission:
 *   patch:
 *     summary: Update user permission
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
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
 *               email:
 *                 type: string
 *               permission:
 *                 type: number
 */
router.patch("/:id/share/users/permission", updatePermission);

/**
 * @openapi
 * /notebooks/{id}/share/users/list:
 *   get:
 *     summary: List shared users
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.get("/:id/share/users", getSharedUsers);

/**
 * @openapi
 * /notebooks/{id}/share/url:
 *   get:
 *     summary: Get public share URL
 *     tags:
 *       - Sharing
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.get("/:id/share/url", getShareUrl);

export { router as sharingRouter };
