import { describe, expect, it } from "vitest";
import { formatHash, parseHash } from "./url.ts";

describe("hash routing", () => {
  it("parses home and sim routes with query params", () => {
    expect(parseHash("")).toEqual({ simId: null, params: {} });
    expect(parseHash("#/")).toEqual({ simId: null, params: {} });
    expect(parseHash("#/kepler?e=0.6&cmp=1")).toEqual({
      simId: "kepler",
      params: { e: "0.6", cmp: "1" },
    });
  });

  it("round-trips a parameter bag with stable key order", () => {
    const hash = formatHash("pendulum", { A: "1.15", gamma: "0.5" });
    expect(hash).toBe("#/pendulum?A=1.15&gamma=0.5");
    expect(parseHash(hash)).toEqual({
      simId: "pendulum",
      params: { A: "1.15", gamma: "0.5" },
    });
  });
});
