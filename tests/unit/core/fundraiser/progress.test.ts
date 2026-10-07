import { describe, expect, it } from "vitest";
import { describeProgress, progress } from "@/core/fundraiser/progress";

// The thermometer's numbers (data-model.md → Progress). Money is whole cents, so every
// "is this paw lit" and "what percent" question is answered in integers; only `level`, which
// is for drawing, is a float. The cases below sit one cent either side of each milestone,
// because that is where a float, or a rounding mode, would light a paw early (Review Focus 1).

const GOAL = 1_000_000; // $10,000
const AMOUNT_MAX_CENTS = 9_999_999_999;

function litAts(raised: number, goal: number): number[] {
  return progress(raised, goal)
    .milestones.filter((m) => m.lit)
    .map((m) => m.at);
}

describe("progress: nothing raised", () => {
  it("is empty, dark and not reached", () => {
    const p = progress(0, GOAL);
    expect(p.level).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.percentLabel).toBe("0%");
    expect(p.reached).toBe(false);
    expect(litAts(0, GOAL)).toEqual([]);
  });
});

describe("progress: one cent either side of each milestone", () => {
  it.each([
    [25, 250_000],
    [50, 500_000],
    [75, 750_000],
  ])("the %i%% paw lights at exactly the milestone and not one cent before", (at, cents) => {
    expect(litAts(cents - 1, GOAL)).not.toContain(at);
    expect(litAts(cents, GOAL)).toContain(at);
    expect(litAts(cents + 1, GOAL)).toContain(at);
  });

  it("$2,499.99 of $10,000 reads 24% over a dark 25% paw; $2,500.00 reads 25% over a lit one", () => {
    const below = progress(249_999, GOAL);
    expect(below.percentLabel).toBe("24%");
    expect(below.milestones[0].lit).toBe(false);

    const at = progress(250_000, GOAL);
    expect(at.percentLabel).toBe("25%");
    expect(at.milestones[0].lit).toBe(true);
  });

  it("lights the paws in order as the amount grows", () => {
    expect(litAts(499_999, GOAL)).toEqual([25]);
    expect(litAts(500_000, GOAL)).toEqual([25, 50]);
    expect(litAts(749_999, GOAL)).toEqual([25, 50]);
    expect(litAts(750_000, GOAL)).toEqual([25, 50, 75]);
    expect(litAts(999_999, GOAL)).toEqual([25, 50, 75]);
    expect(litAts(1_000_000, GOAL)).toEqual([25, 50, 75, 100]);
  });

  it("$9,999.99 of $10,000 reads 99%, is not reached, and the goal paw stays dark", () => {
    const p = progress(999_999, GOAL);
    expect(p.percent).toBe(99);
    expect(p.percentLabel).toBe("99%");
    expect(p.reached).toBe(false);
    expect(p.milestones[3].lit).toBe(false);
  });
});

describe("progress: met and passed", () => {
  it("exactly the goal reads 100%, is reached and lights every paw", () => {
    const p = progress(GOAL, GOAL);
    expect(p.level).toBe(1);
    expect(p.percent).toBe(100);
    expect(p.percentLabel).toBe("100%");
    expect(p.reached).toBe(true);
    expect(litAts(GOAL, GOAL)).toEqual([25, 50, 75, 100]);
  });

  it("$12,000 of $10,000 reads the true 120%, fills to 1 and lights every paw", () => {
    const p = progress(1_200_000, GOAL);
    expect(p.level).toBe(1);
    expect(p.percent).toBe(120);
    expect(p.percentLabel).toBe("120%");
    expect(p.reached).toBe(true);
    expect(litAts(1_200_000, GOAL)).toEqual([25, 50, 75, 100]);
  });
});

describe("progress: the tag's ceiling", () => {
  it("prints 999% as is and 999%+ above it", () => {
    expect(progress(999_00, 100_00).percentLabel).toBe("999%");
    expect(progress(999_00 + 1, 100_00).percentLabel).toBe("999%");
    expect(progress(1000_00, 100_00).percentLabel).toBe("999%+");
  });

  it("a one-cent goal against the largest amount reads 999%+ with the true percent kept", () => {
    const p = progress(AMOUNT_MAX_CENTS, 1);
    expect(p.percent).toBe(AMOUNT_MAX_CENTS * 100);
    expect(p.percentLabel).toBe("999%+");
    expect(p.level).toBe(1);
    expect(p.reached).toBe(true);
  });

  it("the ceiling as the goal behaves the same as any other goal", () => {
    expect(progress(0, AMOUNT_MAX_CENTS).percentLabel).toBe("0%");
    expect(progress(AMOUNT_MAX_CENTS - 1, AMOUNT_MAX_CENTS).percentLabel).toBe("99%");
    expect(progress(AMOUNT_MAX_CENTS - 1, AMOUNT_MAX_CENTS).reached).toBe(false);
    expect(progress(AMOUNT_MAX_CENTS, AMOUNT_MAX_CENTS).percentLabel).toBe("100%");
    expect(progress(AMOUNT_MAX_CENTS, AMOUNT_MAX_CENTS).reached).toBe(true);
    // One cent under a quarter of the largest goal: the integer comparison holds at this size.
    const quarter = Math.ceil((AMOUNT_MAX_CENTS * 25) / 100);
    expect(litAts(quarter - 1, AMOUNT_MAX_CENTS)).toEqual([]);
    expect(litAts(quarter, AMOUNT_MAX_CENTS)).toEqual([25]);
  });
});

describe("progress: the tag's text", () => {
  it.each([
    [0, GOAL, "0% ($0)"],
    [650_000, GOAL, "65% ($6.5K)"],
    [85_000, GOAL, "8% ($850)"],
    [1_000_000, GOAL, "100% ($10K)"],
    [1_200_000, GOAL, "120% ($12K)"],
    [1, 1, "100% ($0.01)"],
    [650_050, GOAL, "65% ($6.5K)"],
  ])("$%i of $%i reads %s", (raised, goal, text) => {
    expect(progress(raised, goal).tagLabel).toBe(text);
  });

  it("rounds a raise just under $1,000 to the next unit instead of writing $1000K", () => {
    expect(progress(99_999_900, 100_000_000).tagLabel).toBe("99% ($1M)");
  });

  it("keeps the 999%+ ceiling and the true raised amount", () => {
    expect(progress(AMOUNT_MAX_CENTS, 1).tagLabel).toBe("999%+ ($100M)");
    expect(progress(1000_00, 100_00).tagLabel).toBe("999%+ ($1K)");
    expect(progress(999_00, 100_00).tagLabel).toBe("999% ($999)");
  });
});

describe("progress: milestone labels", () => {
  it("names the first three by percent and the last by the goal in compact dollars", () => {
    const labels = (goal: number) => progress(0, goal).milestones.map((m) => m.label);
    expect(labels(GOAL)).toEqual(["25%", "50%", "75%", "$10K"]);
    expect(labels(85_000)).toEqual(["25%", "50%", "75%", "$850"]);
    expect(labels(125_000_000)).toEqual(["25%", "50%", "75%", "$1.25M"]);
    expect(labels(1)).toEqual(["25%", "50%", "75%", "$0.01"]);
  });

  it("has the four milestones at 25, 50, 75 and 100", () => {
    expect(progress(0, GOAL).milestones.map((m) => m.at)).toEqual([25, 50, 75, 100]);
  });
});

describe("describeProgress", () => {
  it("gives the pieces at 65%", () => {
    expect(describeProgress(650_000, GOAL)).toEqual({
      raised: "$6,500",
      goal: "$10,000",
      percentLabel: "65%",
      reached: false,
    });
  });

  it("gives the pieces at exactly the goal", () => {
    expect(describeProgress(GOAL, GOAL)).toEqual({
      raised: "$10,000",
      goal: "$10,000",
      percentLabel: "100%",
      reached: true,
    });
  });

  it("gives the true 120% when the goal is passed", () => {
    expect(describeProgress(1_200_000, GOAL)).toEqual({
      raised: "$12,000",
      goal: "$10,000",
      percentLabel: "120%",
      reached: true,
    });
  });

  it("writes cents in full amounts and keeps the 999%+ tag", () => {
    expect(describeProgress(1, 1)).toMatchObject({ raised: "$0.01", goal: "$0.01" });
    expect(describeProgress(AMOUNT_MAX_CENTS, 1).percentLabel).toBe("999%+");
  });
});

// A spread of goals and amounts: round, odd, tiny, huge, and ones that land a cent either side
// of every paw, so the two properties below are checked where they are most likely to break.
const GOALS = [
  1,
  2,
  3,
  7,
  99,
  100,
  101,
  333,
  12_345,
  500_000,
  1_000_000,
  987_654_321,
  AMOUNT_MAX_CENTS,
];

function sweepAmounts(goal: number): number[] {
  const amounts = new Set<number>([0, goal - 1, goal, goal + 1, goal * 2]);
  for (let step = 0; step <= 40; step += 1) {
    const base = Math.floor((goal * step) / 40);
    for (const near of [base - 1, base, base + 1]) amounts.add(near);
  }
  for (const at of [25, 50, 75, 100]) {
    const edge = Math.ceil((goal * at) / 100);
    for (const near of [edge - 1, edge, edge + 1]) amounts.add(near);
  }
  return [...amounts].filter((n) => n >= 0 && n <= AMOUNT_MAX_CENTS);
}

describe("progress: properties over a sweep of amounts", () => {
  it("SC-002: the fill is within 0.01 of the true share, and never above 1", () => {
    for (const goal of GOALS) {
      for (const raised of sweepAmounts(goal)) {
        const { level } = progress(raised, goal);
        const share = Math.min(1, raised / goal);
        expect(Math.abs(level - share)).toBeLessThanOrEqual(0.01);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it("SC-010: lit paws are exactly those at or below the true share; the tag is that share rounded down", () => {
    for (const goal of GOALS) {
      for (const raised of sweepAmounts(goal)) {
        const p = progress(raised, goal);
        // The oracle stays in whole numbers too: raised x 100 is under 2^40, far inside 2^53,
        // and the remainder trick floors the quotient without a float division.
        const scaled = raised * 100;
        const lit = [25, 50, 75, 100].filter((at) => scaled >= goal * at);
        expect(p.milestones.filter((m) => m.lit).map((m) => m.at)).toEqual(lit);
        expect(p.percent).toBe((scaled - (scaled % goal)) / goal);
        expect(p.reached).toBe(raised >= goal);
        // The tag never claims a milestone the paws have not reached.
        expect(p.percent >= 25).toBe(p.milestones[0].lit);
        expect(p.percent >= 100).toBe(p.milestones[3].lit);
      }
    }
  });
});
