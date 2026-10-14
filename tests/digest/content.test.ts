import { afterEach, describe, expect, it, vi } from "vitest";
import type { StockNewsItem } from "@/contracts";
import { selectDigestNews } from "@/server/digest/news";
import { validateSummary } from "@/server/digest/summary";
import { renderEmail } from "@/server/notifications/render";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/server/digest/unsubscribe";

const now = new Date("2026-10-14T09:00:00Z");
const article = (id: string, date = now.toISOString()): StockNewsItem => ({ id, headline: "Synthetic headline", summary: "Synthetic summary", url: "https://example.com/news", source: "Fixture", publishedAt: date, relatedSymbols: [] });
afterEach(() => vi.unstubAllEnvs());

describe("digest input and rendered output", () => {
  it("filters stale, future, malformed, unsafe and duplicate articles, keeping six newest", () => {
    const input = [article("old", "2026-10-12T00:00:00Z"), article("future", "2026-10-15T00:00:00Z"), { ...article("unsafe"), url: "javascript:alert(1)" }, { invalid: true }, ...Array.from({ length: 9 }, (_, index) => article(String(index))), article("0")];
    const selected = selectDigestNews(input, now);
    expect(selected).toHaveLength(6);
    expect(new Set(selected.map((item) => item.id)).size).toBe(6);
    expect(selected.every((item) => /^[0-9]$/.test(item.id))).toBe(true);
  });
  it("rejects hallucinated source IDs and unstructured AI output", () => {
    expect(() => validateSummary({ items: [{ text: "Fact", articleIds: ["invented"] }] }, [article("known")])).toThrow("unknown news source");
    expect(() => validateSummary({ html: "<b>Fact</b>" }, [article("known")])).toThrow();
    expect(validateSummary({ items: [{ text: "Fact", articleIds: ["known"] }] }, [article("known")]).items).toHaveLength(1);
  });
  it("escapes every content field and label, validates URL schemes and labels fixtures", () => {
    const rendered = renderEmail({ subject: "News", title: "<script>attack</script>", paragraphs: ["<img src=x onerror=alert(1)>"], links: [{ label: "<b>source</b>", url: "https://example.com/?a=1&b=2" }], fixture: true });
    expect(rendered.subject).toContain("ТЕСТОВЫЕ ДАННЫЕ");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;img");
    expect(rendered.html).toContain("a=1&amp;b=2");
    expect(() => renderEmail({ subject: "News\r\nBcc: injected", title: "News", paragraphs: [], links: [] })).toThrow();
    expect(() => renderEmail({ subject: "News", title: "News", paragraphs: [], links: [{ label: "bad", url: "javascript:alert(1)" }] })).toThrow();
  });
  it("renders a readable Russian digest in HTML and plain text with safe source and settings links", () => {
    const rendered = renderEmail({
      subject: "Новости рынка", title: "Сводка за 14 октября", paragraphs: ["<b>Рынок</b> и новости"], fixture: true,
      links: [
        { label: "Источник <новости>", url: "https://example.com/news?a=1&b=2" },
        { label: "Настройки ежедневной сводки", url: "https://example.com/settings" },
      ],
    });
    expect(rendered.html).toContain('<html lang="ru">');
    expect(rendered.html).toContain("<h1");
    expect(rendered.html).toContain("Ссылки и источники");
    expect(rendered.html).toContain("ТЕСТОВЫЕ ДАННЫЕ: это демонстрационная сводка");
    expect(rendered.html).toContain("&lt;b&gt;Рынок&lt;/b&gt;");
    expect(rendered.html).toContain("Источник &lt;новости&gt;");
    expect(rendered.html).toContain('href="https://example.com/news?a=1&amp;b=2"');
    expect(rendered.html).toContain('href="https://example.com/settings"');
    expect(rendered.text).toContain("Настройки ежедневной сводки: https://example.com/settings");
    expect(rendered.text).toContain("Источник <новости>: https://example.com/news?a=1&b=2");
    expect(rendered.text).toContain("ТЕСТОВЫЕ ДАННЫЕ");
    expect(rendered.text).not.toContain("<h1");
  });
  it("binds unsubscribe tokens to scope, signature and expiry without storing an email", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-signing-tokens");
    const token = createUnsubscribeToken("user-one", now);
    expect(verifyUnsubscribeToken(token, now)).toBe("user-one");
    expect(() => verifyUnsubscribeToken(`${token}tampered`, now)).toThrow();
    expect(() => verifyUnsubscribeToken(token, new Date("2027-02-01T00:00:00Z"))).toThrow();
  });
});
