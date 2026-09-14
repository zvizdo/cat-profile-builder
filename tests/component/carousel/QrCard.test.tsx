import { render, screen } from "@testing-library/react";
import { create } from "qrcode";
import { describe, expect, it, vi } from "vitest";
import { QrCard } from "@/ui/carousel/QrCard";

// The scan-to-keep card (FR-088; CONTENT.md → Event carousel → QR card): an inline SVG
// QR of the cat's public URL at error-correction level H, named for assistive technology,
// 240px on the 1080p frame so every module is at least 4px, beside the three strings.

vi.mock("qrcode", async (importActual) => {
  const actual = await importActual<typeof import("qrcode")>();
  return { ...actual, create: vi.fn(actual.create) };
});

const url = "http://localhost:3000/cats/solo-nqxxjylu";

describe("QrCard", () => {
  it("encodes the cat's URL at level H, as an SVG in the DOM named for the cat", () => {
    render(<QrCard name="Solo" url={url} />);
    expect(create).toHaveBeenCalledWith(url, { errorCorrectionLevel: "H" });
    const qr = screen.getByRole("img", { name: "Scan — Solo's page" });
    expect(qr.tagName).toBe("svg");
    expect(qr.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    // A version-1 symbol is 21 modules; every module maps to one unit of the viewBox.
    const size = create(url, { errorCorrectionLevel: "H" }).modules.size;
    expect(qr).toHaveAttribute("viewBox", `0 0 ${size} ${size}`);
    expect(qr).toHaveAttribute("shape-rendering", "crispEdges");
  });

  it("says the three strings, with the cat's name in the middle one", () => {
    render(<QrCard name="Solo" url={url} />);
    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("Solo's page")).toBeInTheDocument();
    expect(screen.getByText("Photos and the full story")).toBeInTheDocument();
  });

  it("re-encodes only when the URL changes", () => {
    vi.mocked(create).mockClear();
    const { rerender } = render(<QrCard name="Solo" url={url} />);
    rerender(<QrCard name="Solo" url={url} />);
    expect(create).toHaveBeenCalledTimes(1);
    rerender(<QrCard name="Clip" url="http://localhost:3000/cats/clip-jqyibspi" />);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
