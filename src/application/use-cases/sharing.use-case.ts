import { NotebookLMClient } from "../../infrastructure/third-party/notebooklm/client";
import { ShareStatus, SharedUser } from "../../domain/models/notebooklm.types";
import { SharePermission } from "../../infrastructure/third-party/notebooklm/rpc/types";

export class SharingUseCase {
  constructor(private readonly client: NotebookLMClient) {}

  /**
   * Get the current sharing status of a notebook.
   *
   * @param notebookId - The notebook ID
   * @returns Share status with users and public access info
   */
  async getShareStatus(notebookId: string): Promise<ShareStatus> {
    return this.client.sharing.getStatus(notebookId);
  }

  /**
   * Set whether a notebook is publicly accessible.
   *
   * @param notebookId - The notebook ID
   * @param isPublic - True to make public, false to make private
   * @returns Updated share status
   */
  async setPublic(notebookId: string, isPublic: boolean): Promise<ShareStatus> {
    return this.client.sharing.setPublic(notebookId, isPublic);
  }

  /**
   * Add a user to the notebook with specified permission.
   *
   * @param notebookId - The notebook ID
   * @param email - User email address
   * @param permission - Permission level (VIEWER or EDITOR)
   * @returns Updated share status
   */
  async addUser(
    notebookId: string,
    email: string,
    permission: SharePermission = SharePermission.VIEWER
  ): Promise<ShareStatus> {
    return this.client.sharing.addUser(notebookId, email, permission);
  }

  /**
   * Remove a user from the notebook.
   *
   * @param notebookId - The notebook ID
   * @param email - User email address to remove
   * @returns Updated share status
   */
  async removeUser(notebookId: string, email: string): Promise<ShareStatus> {
    return this.client.sharing.removeUser(notebookId, email);
  }

  /**
   * Update a user's permission level.
   *
   * @param notebookId - The notebook ID
   * @param email - User email address
   * @param permission - New permission level
   * @returns Updated share status
   */
  async updateUserPermission(
    notebookId: string,
    email: string,
    permission: SharePermission
  ): Promise<ShareStatus> {
    return this.client.sharing.updatePermission(notebookId, email, permission);
  }

  /**
   * Get list of all shared users.
   *
   * @param notebookId - The notebook ID
   * @returns Array of shared users
   */
  async getSharedUsers(notebookId: string): Promise<SharedUser[]> {
    const status = await this.getShareStatus(notebookId);
    return status.sharedUsers;
  }

  /**
   * Get the public share URL if notebook is public.
   *
   * @param notebookId - The notebook ID
   * @returns Share URL or null if notebook is private
   */
  async getShareUrl(notebookId: string): Promise<string | null> {
    const status = await this.getShareStatus(notebookId);
    return status.shareUrl;
  }

  /**
   * Check if a notebook is publicly accessible.
   *
   * @param notebookId - The notebook ID
   * @returns True if public, false if private
   */
  async isPublic(notebookId: string): Promise<boolean> {
    const status = await this.getShareStatus(notebookId);
    return status.isPublic;
  }
}
