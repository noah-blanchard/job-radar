import { describe, expect, it } from "vitest";
import {
  countryCode,
  parseLocation,
  type LocationHints,
  type ParsedLocation,
} from "../src/normalize/location";

type Case = [raw: string, expected: Partial<ParsedLocation>, hints?: LocationHints];

const cases: Case[] = [
  // Québec / Montréal variants
  ["Montréal, QC", { city: "Montréal", region: "QC", country: "CA" }],
  ["Montreal, Quebec, Canada", { city: "Montréal", region: "QC", country: "CA" }],
  ["Montreal, QC, CA", { city: "Montréal", region: "QC", country: "CA" }],
  ["MTL", { city: "Montréal", region: "QC", country: "CA" }],
  ["Montréal (Hybrid)", { city: "Montréal", country: "CA", remote: "hybrid" }],
  ["Canada - Montreal", { city: "Montréal", region: "QC", country: "CA" }],
  ["Greater Montreal Area", { city: "Montréal", country: "CA" }],
  ["Québec City, Québec", { city: "Québec", region: "QC", country: "CA" }],
  ["Sherbrooke, Québec, Canada", { city: "Sherbrooke", region: "QC", country: "CA" }],
  ["Saint-Laurent, QC", { city: "Saint-Laurent", region: "QC", country: "CA" }],
  // Rest of Canada
  ["Toronto, ON", { city: "Toronto", region: "ON", country: "CA" }],
  ["Toronto, Ontario, Canada", { city: "Toronto", region: "ON", country: "CA" }],
  ["Toronto, ON, CA", { city: "Toronto", region: "ON", country: "CA" }],
  ["Vancouver, British Columbia", { city: "Vancouver", region: "BC", country: "CA" }],
  ["Waterloo, ON", { city: "Waterloo", region: "ON", country: "CA" }],
  ["Ottawa", { city: "Ottawa", region: "ON", country: "CA" }],
  ["London, ON, Canada", { city: "London", region: "ON", country: "CA" }],
  // Remote
  ["Remote - Canada", { city: null, country: "CA", remote: "remote" }],
  ["Remote (US)", { city: null, country: "US", remote: "remote" }],
  ["Remote", { city: null, country: null, remote: "remote" }],
  ["Canada (Remote)", { country: "CA", remote: "remote" }],
  ["Télétravail - France", { country: "FR", remote: "remote" }],
  ["Remote - EMEA", { country: null, remote: "remote" }],
  ["Anywhere", { remote: "remote" }],
  // United States
  ["San Francisco, CA", { city: "San Francisco", region: "CA", country: "US" }],
  ["New York, NY", { city: "New York", region: "NY", country: "US" }],
  ["NYC", { city: "New York", region: "NY", country: "US" }],
  ["Seattle, WA, United States", { city: "Seattle", region: "WA", country: "US" }],
  ["California - San Francisco", { city: "San Francisco", region: "CA", country: "US" }],
  ["USA - CA - Santa Clara", { city: "Santa Clara", region: "CA", country: "US" }],
  ["Washington, D.C.", { city: "Washington", region: "DC", country: "US" }],
  ["Austin, Texas", { city: "Austin", region: "TX", country: "US" }],
  ["New York, NY; San Francisco, CA", { city: "New York", region: "NY", country: "US" }],
  ["Boston, MA / Remote", { city: "Boston", region: "MA", country: "US" }],
  // France / Europe
  ["Paris, France", { city: "Paris", country: "FR" }],
  ["Paris, Île-de-France, France", { city: "Paris", country: "FR" }],
  ["Lyon", { city: "Lyon", country: "FR" }],
  ["Berlin, Germany", { city: "Berlin", country: "DE" }],
  ["München", { city: "Munich", country: "DE" }],
  ["London, England, United Kingdom", { city: "London", country: "GB" }],
  ["London", { city: "London", country: "GB" }],
  ["Dublin", { city: "Dublin", country: "IE" }],
  ["Amsterdam, Netherlands", { city: "Amsterdam", country: "NL" }],
  ["Stockholm, Sweden (Hybrid)", { city: "Stockholm", country: "SE", remote: "hybrid" }],
  ["Bengaluru, Karnataka, India", { city: "Bengaluru", country: "IN" }],
  // Unknown city + hints
  ["Brossard", { city: "Brossard", country: "CA" }, { country: "ca" }],
  ["3 Locations", { city: null, country: "US" }, { country: "US" }],
  ["Multiple Locations", { city: null, country: null }],
  ["Saguenay, QC", { city: "Saguenay", region: "QC", country: "CA" }],
  ["On-site - Toronto", { city: "Toronto", remote: "onsite" }],
  ["Toronto", { city: "Toronto", remote: "remote" }, { remote: "remote" }],
  ["", { city: null, region: null, country: null, remote: "unknown" }],
];

describe("parseLocation", () => {
  it(`covers at least 30 cases (${cases.length})`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(cases)("%s", (raw, expected, hints) => {
    expect(parseLocation(raw, hints)).toMatchObject(expected);
  });
});

describe("countryCode", () => {
  it.each([
    ["Canada", "CA"],
    ["ca", "CA"],
    ["United States of America", "US"],
    ["UK", "GB"],
    ["France", "FR"],
    ["Atlantis", null],
    [null, null],
  ])("%s -> %s", (raw, expected) => {
    expect(countryCode(raw)).toBe(expected);
  });
});
