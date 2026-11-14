import { describe, expect, it } from "vitest";
import { parseProfile } from "../src/config";
import { alternatives, domainTerms, plainTerm } from "../src/connectors/queries";

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
    expect(plainTerm("audio (software|engine)")).toBe("audio software engine");
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
