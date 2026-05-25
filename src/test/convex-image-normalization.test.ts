import { describe, expect, it } from "vitest";

import { normalizeImageUrl } from "@/lib/image";

describe("normalizeImageUrl", () => {
  it("keeps full Convex storage URLs unchanged", () => {
    const url = "https://outstanding-rabbit-941.convex.cloud/api/storage/abc123";
    expect(normalizeImageUrl(url)).toBe(url);
  });

  it("returns trimmed relative paths unchanged", () => {
    expect(normalizeImageUrl("  /images/test-post.webp  ")).toBe("/images/test-post.webp");
  });
});
