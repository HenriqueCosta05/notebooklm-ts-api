import { ClientCore } from "../core";
import { RPCMethod, SharePermission } from "../rpc/types";
import { ShareStatus, SharedUser } from "../../../../domain/models/notebooklm.types";

const mapSharedUser = (raw: unknown[]): SharedUser => {
  const email = typeof raw[0] === "string" ? raw[0] : "";

  let permission: SharePermission = SharePermission.VIEWER;
  if (typeof raw[1] === "number") {
    const permValues = Object.values(SharePermission) as number[];
    permission = permValues.includes(raw[1]) ? (raw[1] as SharePermission) : SharePermission.VIEWER;
  }

  let displayName: string | null = null;
  let avatarUrl: string | null = null;

  if (Array.isArray(raw[3])) {
    const userInfo = raw[3] as unknown[];
    displayName = typeof userInfo[0] === "string" ? userInfo[0] : null;
    avatarUrl = typeof userInfo[1] === "string" ? userInfo[1] : null;
  }

  return { email, permission, displayName, avatarUrl };
};

const mapShareStatus = (raw: unknown[], notebookId: string): ShareStatus => {
  const users: SharedUser[] = [];

  if (Array.isArray(raw[0])) {
    for (const userData of raw[0] as unknown[]) {
      if (Array.isArray(userData)) {
        users.push(mapSharedUser(userData as unknown[]));
      }
    }
  }

  let isPublic = false;
  if (Array.isArray(raw[1]) && (raw[1] as unknown[]).length > 0) {
    isPublic = Boolean((raw[1] as unknown[])[0]);
  }

  const shareUrl = isPublic
    ? `https://notebooklm.google.com/notebook/${notebookId}`
    : null;

  return { notebookId, isPublic, sharedUsers: users, shareUrl };
};

export class SharingAPI {
  constructor(private readonly core: ClientCore) {}

  async getStatus(notebookId: string): Promise<ShareStatus> {
    const params = [notebookId];
    const result = await this.core.rpcCall(RPCMethod.GET_SHARE_STATUS, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    if (!Array.isArray(result)) {
      return { notebookId, isPublic: false, sharedUsers: [], shareUrl: null };
    }

    return mapShareStatus(result as unknown[], notebookId);
  }

  async setPublic(notebookId: string, isPublic: boolean): Promise<ShareStatus> {
    const accessValue = isPublic ? 1 : 0;
    const params = [notebookId, [[accessValue]]];

    await this.core.rpcCall(RPCMethod.SHARE_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    return this.getStatus(notebookId);
  }

  async addUser(
    notebookId: string,
    email: string,
    permission: SharePermission = SharePermission.VIEWER
  ): Promise<ShareStatus> {
    const params = [notebookId, [[email, permission]]];

    await this.core.rpcCall(RPCMethod.SHARE_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    return this.getStatus(notebookId);
  }

  async removeUser(notebookId: string, email: string): Promise<ShareStatus> {
    const params = [notebookId, [[email, 4]]];

    await this.core.rpcCall(RPCMethod.SHARE_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    return this.getStatus(notebookId);
  }

  async updatePermission(
    notebookId: string,
    email: string,
    permission: SharePermission
  ): Promise<ShareStatus> {
    const params = [notebookId, [[email, permission]]];

    await this.core.rpcCall(RPCMethod.SHARE_NOTEBOOK, params, {
      sourcePath: `/notebook/${notebookId}`,
      allowNull: true,
    });

    return this.getStatus(notebookId);
  }
}
