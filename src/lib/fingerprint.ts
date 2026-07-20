// Issue fingerprinting (§5).
//
// Fingerprint = hash of (project_id, page_type, rule_id, target_locator).
// Same fingerprint across runs == the same tracked issue. The locator is what
// distinguishes "alt missing on /hero.jpg" from the same rule on another image.

import { createHash } from "node:crypto";
import type { PageType } from "./types";

// Field separator that cannot appear inside any component, so distinct tuples
// can never hash to the same key.
const SEP = "␟"; // U+241F SYMBOL FOR UNIT SEPARATOR

export function fingerprint(input: {
  projectId: string;
  pageType: PageType;
  ruleId: string;
  targetLocator: string;
}): string {
  const key = [
    input.projectId,
    input.pageType,
    input.ruleId,
    input.targetLocator,
  ].join(SEP);
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
