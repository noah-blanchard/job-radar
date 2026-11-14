import { describe, expect, it } from "vitest";
import { classifyNewGrad, isClearlyNotNewGrad, yearsRequired } from "../src/classify/rules";
import { fixture } from "./helpers";

interface Annotated {
  title: string;
  expected: boolean | null;
}

const { titles } = fixture<{ titles: Annotated[] }>("newgrad-titles.json");

describe("new-grad rules on 50 hand-annotated real titles", () => {
  const results = titles.map((t) => ({ ...t, got: classifyNewGrad({ title: t.title }) }));
  const clear = results.filter((r) => r.expected !== null);

  it("has 50 titles, most of them unambiguous", () => {
    expect(titles).toHaveLength(50);
    expect(clear.length).toBeGreaterThanOrEqual(40);
  });

  it("is right on >= 90% of the unambiguous titles", () => {
    const right = clear.filter((r) => r.got.isNewGrad === r.expected);
    const wrong = clear.filter((r) => r.got.isNewGrad !== r.expected);
    // Printed so the precision is visible in the test output (and in the PR).
    console.info(
      `new-grad accuracy on unambiguous titles: ${right.length}/${clear.length}` +
        (wrong.length
          ? `; misses: ${wrong.map((w) => `"${w.title}" -> ${w.got.isNewGrad}`).join("; ")}`
          : ""),
    );
    expect(right.length / clear.length).toBeGreaterThanOrEqual(0.9);
  });

  it("has >= 90% precision on the titles it labels new grad", () => {
    const flagged = clear.filter((r) => r.got.isNewGrad === true);
    const ok = flagged.filter((r) => r.expected === true);
    console.info(`new-grad precision: ${ok.length}/${flagged.length}`);
    expect(ok.length / flagged.length).toBeGreaterThanOrEqual(0.9);
  });

  it("never calls a senior title or an internship new grad", () => {
    for (const r of clear.filter((x) => x.expected === false))
      expect(r.got.isNewGrad, r.title).not.toBe(true);
  });

  it("explains every verdict", () => {
    for (const r of results) expect(r.got.reason.length).toBeGreaterThan(3);
  });
});

describe("classifyNewGrad", () => {
  it("treats internships, co-ops and student jobs as not new grad (full-time wanted)", () => {
    for (const title of [
      "Software Engineer Intern",
      "Co-op Developer",
      "Stage - Développeur web",
    ]) {
      const v = classifyNewGrad({ title });
      expect(v).toMatchObject({ isNewGrad: false, seniority: "intern" });
    }
    expect(
      classifyNewGrad({ title: "Software Engineer", employmentType: "Internship" }).isNewGrad,
    ).toBe(false);
  });

  it("reads seniority from the title", () => {
    expect(classifyNewGrad({ title: "Senior Backend Engineer" })).toMatchObject({
      isNewGrad: false,
      seniority: "senior",
      reason: "titre : « Senior »",
    });
    expect(classifyNewGrad({ title: "Software Engineer II" }).seniority).toBe("mid");
    expect(classifyNewGrad({ title: "Engineering Manager" }).seniority).toBe("manager");
    // "Product Manager" names a function, not a management level.
    expect(classifyNewGrad({ title: "Associate Product Manager" }).isNewGrad).toBe(true);
    expect(classifyNewGrad({ title: "Chief of Staff" }).isNewGrad).toBe(false);
    expect(classifyNewGrad({ title: "Développeur expérimenté (H/F)" }).isNewGrad).toBe(false);
    expect(classifyNewGrad({ title: "Jeune diplômé - Développeur Full Stack" })).toMatchObject({
      isNewGrad: true,
      seniority: "entry",
    });
  });

  it("does not take a field of study for a hiring marker", () => {
    expect(classifyNewGrad({ title: "Graduate Program Coordinator" }).isNewGrad).toBeNull();
    expect(classifyNewGrad({ title: "Graduate Admissions Advisor" }).isNewGrad).toBeNull();
  });

  it("marks titles with both markers as ambiguous", () => {
    const v = classifyNewGrad({ title: "Junior/Senior Frontend Developer" });
    expect(v.isNewGrad).toBeNull();
    expect(v.reason).toContain("ambigu");
  });

  it("uses the years of experience required by the description", () => {
    const d = (text: string) =>
      classifyNewGrad({ title: "Software Engineer", descriptionText: text });
    expect(d("You have 5+ years of professional experience with Go.")).toMatchObject({
      isNewGrad: false,
      seniority: "senior",
      yearsRequired: 5,
    });
    expect(d("3-5 years of experience building web apps").isNewGrad).toBe(false);
    expect(d("Experience: 0-1 years. Bachelor's degree.").isNewGrad).toBe(true);
    expect(d("Minimum 2 years of experience").isNewGrad).toBeNull();
    expect(d("Our company has 50 years of experience serving clients.").isNewGrad).toBeNull();
    expect(
      classifyNewGrad({
        title: "Développeur",
        descriptionText: "Vous avez au moins 3 ans d'expérience en Java.",
      }).isNewGrad,
    ).toBe(false);
  });

  it("uses the source hint when the title says nothing", () => {
    expect(classifyNewGrad({ title: "Software Engineer", seniorityHint: "entry" })).toMatchObject({
      isNewGrad: true,
      reason: "source : offre listée comme new grad / entry-level",
    });
    // A senior title wins over the hint; a clearly senior description makes it ambiguous.
    expect(
      classifyNewGrad({ title: "Senior Software Engineer", seniorityHint: "entry" }).isNewGrad,
    ).toBe(false);
    expect(
      classifyNewGrad({
        title: "Software Engineer",
        seniorityHint: "entry",
        descriptionText: "4+ years of experience required",
      }).isNewGrad,
    ).toBeNull();
    expect(
      classifyNewGrad({ title: "Software Engineer", seniorityHint: "experienced" }).isNewGrad,
    ).toBe(false);
    expect(classifyNewGrad({ title: "Software Engineer", seniorityHint: "intern" }).seniority).toBe(
      "intern",
    );
  });

  it("leaves jobs without any marker ambiguous", () => {
    expect(classifyNewGrad({ title: "Software Engineer" })).toMatchObject({
      isNewGrad: null,
      seniority: null,
      reason: "aucun indice",
    });
  });
});

describe("yearsRequired", () => {
  it.each([
    ["Requires 3+ years of experience", 3],
    ["at least two years of relevant work experience", 2],
    ["5 to 7 yrs of industry experience", 5],
    ["Experience: minimum 4 years", 4],
    ["2 ans d'expérience minimum", 2],
    ["3 années d'expérience", 3],
    ["We are 10 years old", null],
    ["", null],
  ])("%s -> %s", (text, n) => {
    expect(yearsRequired(text)).toBe(n);
  });

  it("keeps the smallest requirement", () => {
    expect(yearsRequired("BS and 5+ years of experience, or MS and 3+ years of experience")).toBe(
      3,
    );
  });
});

describe("isClearlyNotNewGrad (detail pre-filter)", () => {
  it("skips seniors and interns only", () => {
    expect(isClearlyNotNewGrad("Staff Engineer")).toBe(true);
    expect(isClearlyNotNewGrad("Data Science Intern")).toBe(true);
    expect(isClearlyNotNewGrad("Member of Technical Staff")).toBe(false);
    expect(isClearlyNotNewGrad("Software Engineer")).toBe(false);
  });
});
