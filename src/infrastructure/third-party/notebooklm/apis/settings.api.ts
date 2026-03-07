import { ClientCore } from "../core";
import { RPCMethod } from "../rpc/types";
import { UserSettings } from "../../../../domain/models/notebooklm.types";

export class SettingsAPI {
  constructor(private readonly core: ClientCore) {}

  async get(): Promise<UserSettings> {
    const params: unknown[] = [];
    const result = await this.core.rpcCall(RPCMethod.GET_USER_SETTINGS, params, {
      allowNull: true,
    });

    if (!Array.isArray(result)) {
      return { outputLanguage: null };
    }

    const raw = result as unknown[];
    const outputLanguage =
      typeof raw[0] === "string" && raw[0].length > 0 ? raw[0] : null;

    return { outputLanguage };
  }

  async setOutputLanguage(languageCode: string): Promise<UserSettings> {
    const params: unknown[] = [languageCode];
    await this.core.rpcCall(RPCMethod.SET_USER_SETTINGS, params, {
      allowNull: true,
    });

    return this.get();
  }
}
