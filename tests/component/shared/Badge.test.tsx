import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, type BadgeStatus } from "@/ui/shared/Badge";

const LABELS: Record<BadgeStatus, string> = {
  live: "LIVE",
  draft: "DRAFT",
  archived: "ARCHIVED",
  unfinished: "UNFINISHED",
  enhanced: "ENHANCED",
};

describe("Badge", () => {
  it("prints the uppercase mono word for every status", () => {
    render(
      <>
        {(Object.keys(LABELS) as BadgeStatus[]).map((status) => (
          <Badge key={status} status={status} />
        ))}
      </>,
    );
    for (const label of Object.values(LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("only LIVE is blue and only UNFINISHED is clay", () => {
    render(
      <>
        {(Object.keys(LABELS) as BadgeStatus[]).map((status) => (
          <Badge key={status} status={status} />
        ))}
      </>,
    );
    expect(screen.getByText("LIVE").className).toMatch(/bg-blue/);
    expect(screen.getByText("UNFINISHED").className).toMatch(/clay/);
    for (const label of ["DRAFT", "ARCHIVED", "ENHANCED"]) {
      expect(screen.getByText(label).className).not.toMatch(/blue|clay/);
    }
  });
});
