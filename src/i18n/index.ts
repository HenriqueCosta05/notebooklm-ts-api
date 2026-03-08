import * as fs from "fs";
import * as path from "path";

export type LocaleMessages = Record<string, unknown>;

const localesDir = path.resolve(__dirname, "../../locales");

const loadLocale = (locale: string): LocaleMessages => {
  const filePath = path.join(localesDir, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Locale file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as LocaleMessages;
};

const getNestedValue = (obj: LocaleMessages, keyPath: string): string | null => {
  const parts = keyPath.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : null;
};

const interpolate = (template: string, params: Record<string, string>): string =>
  Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), value),
    template,
  );

/**
 * Lightweight internationalisation helper.
 *
 * Loads a JSON locale file from the project's `locales/` directory and exposes
 * a single {@link I18n.t} method for translating dot-separated keys with optional
 * `{{placeholder}}` interpolation.
 *
 * @example
 * ```ts
 * const i18n = new I18n("en");
 * i18n.t("errors.not_found");                        // "The requested resource was not found."
 * i18n.t("sources.timeout", { id: "s1", seconds: "30" }); // "Source s1 timed out after 30s."
 * ```
 */
export class I18n {
  private readonly messages: LocaleMessages;
  private readonly locale: string;

  /**
   * @param locale - BCP-47 locale code (e.g. `"en"`).  A matching
   *   `<locale>.json` file must exist in the `locales/` directory.
   * @throws {Error} When the locale file cannot be found.
   */
  constructor(locale: string) {
    this.locale = locale;
    this.messages = loadLocale(locale);
  }

  /**
   * Translates a dot-separated message key and interpolates any named
   * `{{placeholder}}` tokens with the provided `params` map.
   *
   * When the key cannot be found the raw key path is returned unchanged so
   * that missing translations never cause a runtime crash.
   *
   * @param key    - Dot-separated path into the locale JSON (e.g. `"errors.not_found"`).
   * @param params - Optional map of placeholder names to replacement strings.
   * @returns The translated, interpolated string, or `key` if not found.
   *
   * @example
   * ```ts
   * i18n.t("notebooks.created");
   * // → "Notebook created successfully."
   *
   * i18n.t("errors.validation", { message: "title is required" });
   * // → "Validation failed: title is required"
   * ```
   */
  t(key: string, params: Record<string, string> = {}): string {
    const template = getNestedValue(this.messages, key);
    if (template === null) {
      return key;
    }
    return Object.keys(params).length > 0 ? interpolate(template, params) : template;
  }

  /**
   * Returns the locale code this instance was created with.
   *
   * @returns BCP-47 locale string (e.g. `"en"`).
   */
  getLocale(): string {
    return this.locale;
  }
}

const DEFAULT_LOCALE = "en";

let instance: I18n | null = null;

/**
 * Initialises (or re-initialises) the module-level singleton {@link I18n}
 * instance.  Call this once at application start-up, typically in `server.ts`,
 * before any request handlers run.
 *
 * @param locale - BCP-47 locale code.  Defaults to `"en"`.
 * @returns The newly created {@link I18n} singleton.
 *
 * @example
 * ```ts
 * initI18n("en");
 * ```
 */
export const initI18n = (locale: string = DEFAULT_LOCALE): I18n => {
  instance = new I18n(locale);
  return instance;
};

/**
 * Returns the current module-level {@link I18n} singleton.
 *
 * If {@link initI18n} has not yet been called the singleton is lazily created
 * with the default `"en"` locale.
 *
 * @returns The active {@link I18n} instance.
 */
export const getI18n = (): I18n => {
  if (!instance) {
    instance = new I18n(DEFAULT_LOCALE);
  }
  return instance;
};

/**
 * Convenience shorthand for `getI18n().t(key, params)`.
 *
 * Suitable for import anywhere in the codebase without needing to carry an
 * {@link I18n} reference.
 *
 * @param key    - Dot-separated translation key.
 * @param params - Optional interpolation parameters.
 * @returns Translated string, or `key` when the translation is not found.
 *
 * @example
 * ```ts
 * import { t } from "../../i18n";
 *
 * t("health.ok");                             // "Service is healthy."
 * t("errors.validation", { message: "..." }); // "Validation failed: ..."
 * ```
 */
export const t = (key: string, params: Record<string, string> = {}): string =>
  getI18n().t(key, params);
