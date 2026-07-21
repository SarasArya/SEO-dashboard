import { describe, it, expect } from "vitest";
import { ANALYZERS } from "@/lib/pipeline/analyzers";
import { CATALOG } from "@/lib/pipeline/analyzers/catalog";

// The Methodology page renders CATALOG. This guards that it never drifts from
// the analyzers the engine actually runs: every analyzer is documented, and no
// catalog entry describes a check that doesn't exist.
describe("check catalog integrity", () => {
  it("documents every registered analyzer exactly once", () => {
    const registryIds = ANALYZERS.map((a) => a.id).sort();
    const catalogIds = CATALOG.map((c) => c.analyzerId).sort();
    expect(catalogIds).toEqual(registryIds);
  });

  it("has no duplicate catalog entries", () => {
    const ids = CATALOG.map((c) => c.analyzerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has the fields the page needs", () => {
    for (const c of CATALOG) {
      expect(c.title, c.analyzerId).toBeTruthy();
      expect(c.detects, c.analyzerId).toBeTruthy();
      expect(c.remediation, c.analyzerId).toBeTruthy();
      expect(["critical", "warning", "info"]).toContain(c.severity);
    }
  });
});
