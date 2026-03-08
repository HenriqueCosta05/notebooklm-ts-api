import { I18n, initI18n, getI18n, t } from "../../src/i18n";

describe("I18n", () => {
  describe("constructor", () => {
    it("loads the 'en' locale without throwing", () => {
      expect(() => new I18n("en")).not.toThrow();
    });

    it("throws when the locale file does not exist", () => {
      expect(() => new I18n("xx-nonexistent")).toThrow(/Locale file not found/);
    });

    it("exposes the locale via getLocale()", () => {
      const i18n = new I18n("en");
      expect(i18n.getLocale()).toBe("en");
    });
  });

  describe("t()", () => {
    let i18n: I18n;

    beforeEach(() => {
      i18n = new I18n("en");
    });

    it("returns the translated string for a valid key", () => {
      const result = i18n.t("health.ok");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns the key path itself when the key does not exist", () => {
      const result = i18n.t("nonexistent.key.path");
      expect(result).toBe("nonexistent.key.path");
    });

    it("interpolates a single parameter into the template", () => {
      const result = i18n.t("errors.validation", { message: "field is required" });
      expect(result).toContain("field is required");
    });

    it("interpolates multiple parameters into the template", () => {
      const result = i18n.t("sources.timeout", { id: "src-1", seconds: "30" });
      expect(result).toContain("src-1");
      expect(result).toContain("30");
    });

    it("leaves unmatched placeholders unchanged when no params given", () => {
      const result = i18n.t("errors.validation");
      expect(result).toContain("{{message}}");
    });

    it("handles extra params that do not appear in the template gracefully", () => {
      expect(() =>
        i18n.t("health.ok", { extraKey: "extraValue" }),
      ).not.toThrow();
    });

    it("returns a non-empty string for all top-level error keys", () => {
      const errorKeys = [
        "errors.internal",
        "errors.not_found",
        "errors.bad_request",
        "errors.unauthorized",
        "errors.forbidden",
        "errors.rate_limited",
        "errors.server_error",
        "errors.client_error",
      ];
      for (const key of errorKeys) {
        const result = i18n.t(key);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it("returns a non-empty string for all notebook keys", () => {
      const keys = [
        "notebooks.created",
        "notebooks.deleted",
        "notebooks.renamed",
        "notebooks.list_empty",
        "notebooks.share_updated",
      ];
      for (const key of keys) {
        expect(i18n.t(key).length).toBeGreaterThan(0);
      }
    });

    it("returns a non-empty string for all source keys", () => {
      const keys = [
        "sources.added",
        "sources.deleted",
        "sources.renamed",
        "sources.refreshed",
        "sources.ready",
      ];
      for (const key of keys) {
        expect(i18n.t(key).length).toBeGreaterThan(0);
      }
    });

    it("returns a non-empty string for all artifact keys", () => {
      const keys = [
        "artifacts.generation_started",
        "artifacts.generation_complete",
        "artifacts.generation_failed",
        "artifacts.deleted",
        "artifacts.renamed",
        "artifacts.exported",
      ];
      for (const key of keys) {
        expect(i18n.t(key).length).toBeGreaterThan(0);
      }
    });

    it("returns a non-empty string for all chat keys", () => {
      const keys = [
        "chat.rate_limited",
        "chat.timeout",
        "chat.cache_cleared",
        "chat.configured",
        "chat.mode_set",
      ];
      for (const key of keys) {
        expect(i18n.t(key).length).toBeGreaterThan(0);
      }
    });

    it("handles deeply nested keys that do not exist", () => {
      expect(i18n.t("a.b.c.d.e")).toBe("a.b.c.d.e");
    });

    it("handles a key that points to an object node rather than a string", () => {
      const result = i18n.t("errors");
      expect(result).toBe("errors");
    });

    it("replaces the same placeholder multiple times when it appears twice", () => {
      const i18nInstance = new I18n("en");
      const result = i18nInstance.t("sources.not_found", { id: "abc" });
      expect(result).toContain("abc");
      expect(result).not.toContain("{{id}}");
    });

    it("does not mutate the params object", () => {
      const params = { message: "original" };
      i18n.t("errors.validation", params);
      expect(params.message).toBe("original");
    });
  });
});

describe("initI18n", () => {
  it("returns an I18n instance with the requested locale", () => {
    const instance = initI18n("en");
    expect(instance.getLocale()).toBe("en");
  });

  it("replaces the singleton so getI18n returns the new instance", () => {
    const freshInstance = initI18n("en");
    const retrieved = getI18n();
    expect(retrieved.getLocale()).toBe(freshInstance.getLocale());
  });

  it("uses 'en' as default when no locale argument is provided", () => {
    const instance = initI18n();
    expect(instance.getLocale()).toBe("en");
  });
});

describe("getI18n", () => {
  it("returns an I18n instance", () => {
    const instance = getI18n();
    expect(instance).toBeInstanceOf(I18n);
  });

  it("creates a default 'en' instance when none has been initialised", () => {
    const instance = getI18n();
    expect(instance.getLocale()).toBe("en");
  });

  it("returns the same instance across multiple calls", () => {
    const a = getI18n();
    const b = getI18n();
    expect(a).toBe(b);
  });
});

describe("t (module-level helper)", () => {
  it("translates a known key", () => {
    const result = t("health.ok");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the key for an unknown path", () => {
    expect(t("completely.unknown.key")).toBe("completely.unknown.key");
  });

  it("interpolates params correctly", () => {
    const result = t("errors.validation", { message: "test error" });
    expect(result).toContain("test error");
  });

  it("is consistent with an I18n instance using the same locale", () => {
    const instance = new I18n("en");
    expect(t("health.ok")).toBe(instance.t("health.ok"));
  });
});
