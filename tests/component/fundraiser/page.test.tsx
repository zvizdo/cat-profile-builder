import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FundraiserPage, { dynamic, metadata } from "@/app/(public)/fundraiser/page";
import * as address from "@/core/fundraiser/address";

// The page is a server component: it awaits the address, hands it to the reader untouched
// and renders the display. What the reader does with each value is proved in its own
// tests; here the point is that the page is complete for every address (quickstart 9),
// that script text is only ever words (security review), and that nothing the address says
// reaches the document's title or the search engines.

vi.mock("@/core/fundraiser/address", { spy: true });

type Query = Record<string, string | string[] | undefined>;

async function open(query: Query) {
  const view = render(await FundraiserPage({ searchParams: Promise.resolve(query) }));
  return view;
}

const HINT = "Hover, tap or Tab to the thermometer to set your goal.";

beforeEach(() => {
  vi.mocked(address.readAddress).mockClear();
});

describe("FundraiserPage metadata", () => {
  it("has one static title, never the headline, and asks search engines to stay away", () => {
    expect(metadata.title).toBe("Fundraiser");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("is read per request, so the address is never frozen at build time", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("FundraiserPage address", () => {
  it("passes the query to the reader exactly as it arrived", async () => {
    const query: Query = { headline: ["First", "Second"], raised: "6500", extra: undefined };
    await open(query);
    expect(address.readAddress).toHaveBeenCalledTimes(1);
    expect(vi.mocked(address.readAddress).mock.calls[0]?.[0]).toBe(query);
  });

  it("shows the sample drive: 65 percent, with the headline as the only h1", async () => {
    await open({ headline: "Spring Vet Fund", raised: "6500", goal: "10000" });
    expect(screen.getByRole("heading", { level: 1, name: "Spring Vet Fund" })).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "$6,500 raised of a $10,000 goal, 65 percent",
    );
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("is a complete display with nothing in the address, and says how to start", async () => {
    await open({});
    expect(screen.getByRole("heading", { level: 1, name: "Help us reach our goal" })).toBeVisible();
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "$0 raised of a $5,000 goal, 0 percent",
    );
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it.each([
    ["raised", { headline: "Spring", raised: "abc", goal: "10000" }, "$0 raised of a $10,000 goal"],
    ["goal", { headline: "Spring", raised: "100", goal: "-1" }, "$100 raised of a $5,000 goal"],
    ["goal at zero", { headline: "Spring", raised: "100", goal: "0" }, "$100 raised of a $5,000"],
    ["both", { headline: "Spring", raised: "1e9", goal: "2000" }, "$0 raised of a $2,000 goal"],
  ] as const)("keeps the good values when %s is bad", async (_name, query, spoken) => {
    await open({ ...query });
    expect(screen.getByRole("heading", { level: 1, name: "Spring" })).toBeInTheDocument();
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toContain(spoken);
  });

  it("falls back to the default headline when only the headline is bad", async () => {
    await open({ headline: "%E2%80%8B", raised: "6500", goal: "10000" });
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toContain("$6,500 raised");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows script text as words and creates no script element", async () => {
    const { container } = await open({ headline: "<script>alert(1)</script>" });
    expect(container.querySelector("script")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "<script>alert(1)</script>",
    );
  });

  it("shows an image tag as words and creates no image from it", async () => {
    const { container } = await open({ headline: "<img src=x onerror=alert(1)>" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "<img src=x onerror=alert(1)>",
    );
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it("never lets the headline reach an attribute", async () => {
    const { container } = await open({ headline: "Zebra Appeal" });
    const carriers = [...container.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes].filter((attribute) => attribute.value.includes("Zebra Appeal")),
    );
    expect(carriers).toEqual([]);
    expect(document.title).not.toContain("Zebra");
  });

  it.each([
    ["no keys", {}, true],
    ["an empty goal", { goal: "" }, false],
    ["only a headline", { headline: "Spring" }, false],
    ["only raised", { raised: "10" }, false],
    ["a bad value", { goal: "abc" }, false],
    ["unknown keys only", { debug: "1", hold: "3" }, true],
  ] as const)("hint with %s: %s", async (_name, query, shown) => {
    await open({ ...query });
    expect(screen.queryByText(HINT) !== null).toBe(shown);
  });
});
