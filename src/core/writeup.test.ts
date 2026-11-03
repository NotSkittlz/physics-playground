import { describe, expect, it } from "vitest";
import { renderWriteup } from "./writeup.ts";

describe("writeup renderer", () => {
  it("renders headings, lists, and KaTeX", () => {
    const html = renderWriteup(`## Title

A pendulum $E = \\tfrac12 I \\omega^2$ is conservative.

- Try Verlet
- Try Euler

$$
\\ddot\\theta + \\sin\\theta = 0
$$
`);
    expect(html).toContain("<h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("katex");
    expect(html).toContain("eq");
  });

  it("escapes raw HTML", () => {
    const html = renderWriteup(`Hello <img src=x onerror=alert(1)>`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
