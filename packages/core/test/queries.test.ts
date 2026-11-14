import { describe, expect, it } from "vitest";
import { parseProfile } from "../src/config";
import { alternatives, domainTerms, expandGroups, plainTerm } from "../src/connectors/queries";

describe("aggregator search terms from bilingual keywords", () => {
  it("splits only top-level alternatives", () => {
    expect(alternatives("data engineer(ing)?|ing[ée]nieur(e)? de donn[ée]es")).toEqual([
      "data engineer(ing)?",
      "ing[ée]nieur(e)? de donn[ée]es",
    ]);
    expect(alternatives("audio (software|engine)")).toEqual(["audio (software|engine)"]);
    expect(alternatives("[a|b]c|d")).toEqual(["[a|b]c", "d"]);
    expect(alternatives("c\\|d")).toEqual(["c\\|d"]);
  });

  it("never glues alternatives into one word", () => {
    expect(plainTerm("etl|elt")).toBe("etl elt");
  });

  it("expands the alternatives inside groups into separate patterns", () => {
    expect(expandGroups("audio (software|engine)")).toEqual(["audio (software)", "audio (engine)"]);
    expect(expandGroups("data warehous(?:e|ing)")).toEqual([
      "data warehous(e)",
      "data warehous(ing)",
    ]);
    expect(expandGroups("recommend(er|ation) (systems|engines)").map(plainTerm)).toEqual([
      "recommender systems",
      "recommender engines",
      "recommendation systems",
      "recommendation engines",
    ]);
    // Groups without alternatives, classes and escapes are left alone.
    expect(expandGroups("engineer(ing)? [a|b] c\\|d")).toEqual(["engineer(ing)? [a|b] c\\|d"]);
    expect(expandGroups("(a|b|c) (d|e|f)")).toHaveLength(4);
  });

  it("builds real phrases and words from grouped alternatives", () => {
    const [d] = domainTerms(
      parseProfile({
        domains: {
          data: [
            "data warehous(e|ing)|ing[ée]nieur[(.·e)]* (de|des) donn[ée]es",
            "data scien(ce|tist)",
          ],
        },
      }),
    );
    expect(d!.terms).toEqual([
      "data warehouse",
      "data warehousing",
      "ingénieur de données",
      "ingénieur des données",
      "data science",
      "data scientist",
    ]);
    expect(d!.words).toEqual([
      "data",
      "warehouse",
      "warehousing",
      "données",
      "science",
      "scientist",
    ]);
  });

  it("gives one clean term per language, English first", () => {
    const [d] = domainTerms(
      parseProfile({
        domains: {
          data: ["data engineer(ing)?|ing[ée]nieur[e]? de donn[ée]es", "etl|elt"],
        },
      }),
    );
    expect(d!.terms).toEqual(["data engineering", "ingénieur de données", "etl", "elt"]);
    // Job nouns and small words of either language are never OR-search words.
    expect(d!.words).toEqual(["data", "données", "etl", "elt"]);
  });
});
