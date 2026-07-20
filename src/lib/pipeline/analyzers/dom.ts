// Cheerio-based parsing helpers shared by analyzers.
import * as cheerio from "cheerio";

export type Dom = cheerio.CheerioAPI;

export function parse(html: string): Dom {
  return cheerio.load(html || "");
}

export function textOf($: Dom, selector: string): string {
  return $(selector).first().text().trim();
}

// Normalize a URL/path for locator stability.
export function pathOf(href: string): string {
  try {
    return new URL(href, "https://placeholder.local").pathname;
  } catch {
    return href;
  }
}
