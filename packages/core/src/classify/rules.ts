/**
 * New-grad classification by rules (spec section 8): title markers first, then what the source
 * itself says (seniorityHint), then the years of experience required by the description.
 * Ambiguous jobs stay `isNewGrad = null` (the optional LLM may decide them later).
 */
import type { SeniorityHint } from "../connectors/types";

export type Seniority = "intern" | "entry" | "mid" | "senior" | "manager";

export interface NewGradInput {
  title: string;
  descriptionText?: string | null;
  employmentType?: string | null;
  seniorityHint?: SeniorityHint | string | null;
}

export interface NewGradVerdict {
  isNewGrad: boolean | null;
  seniority: Seniority | null;
  /** Short French explanation shown in the dashboard ("titre : « Senior »"). */
  reason: string;
  /** Minimum years of experience found in the description, if any. */
  yearsRequired: number | null;
}

// ---------- title markers ----------

/** Internships, co-ops, apprenticeships, student jobs: not full-time new-grad roles. */
const INTERN =
  /\b(intern|interns|internship|co-?op|stage|stagiaire|alternance|alternant|apprenti|apprentice(?:ship)?|working student|werkstudent(?:in)?|studentermedhj\w+|student (?:assistant|worker|job|employee)|praktikum|praktikant(?:in)?|traineeship)\b|\bsummer (?:20\d\d|analyst|associate)\b/i;

/** Strong new-grad markers. */
const POSITIVE =
  /\b(new[- ]?grad(?:uate)?s?|grads?|trainee|entry[- ]level|early[- ]careers?|early talent|campus|class of 20\d\d|(?:analyst|associate|rotational|leadership development|technology development) program(?:me)?|junior|jr\.?|jeunes? dipl[oô]m[ée]e?s?|nouveaux? dipl[oô]m[ée]e?s?|d[ée]butant(?:e|s)?|associate (?:\w+ ){0,2}(?:engineer|developer|designer|scientist)|associate (?:software|data|product manager|consultant))(?![\wÀ-ÿ])/i;

/**
 * "Graduate" as a hiring marker ("Graduate Trader", "Engineer - Graduate", "2027 Graduate
 * Program"), not as a field ("Graduate Admissions Coordinator", "Graduate Programs").
 */
const GRADUATE =
  /(?:^|[-–,|(:/]\s*|\b20\d\d\s+|\b(?:engineer(?:ing)?|developer|analyst|scientist|designer)\s+)graduates?\b|\bgraduate (?:program(?:me)?|rotation|scheme|engineer|developer|analyst|scientist|trader|trainee|software|hire|role|position|consultant|associate|designer)\b/i;
const GRADUATE_NOT =
  /\bgraduate (?:programs? (?:coordinator|manager|director|administrator|assistant|advisor)|admissions|advis|studies|school|students?|education|research|teaching|assistant|nurse)|& executive education/i;

/** "Software Engineer I", "Engineer 1", "SDE I": level-one ladders (weak marker). */
const LEVEL_ONE =
  /\b(?:[Ee]ngineer|[Dd]eveloper|SDE|SWE|[Aa]nalyst|[Ss]cientist|[Tt]echnician|[Dd]esigner)\s*(?:I|1)\b(?!I)/;
/** Same, before the field: "Engineer I, Software". */
const LEVEL_ONE_PREFIX = /\b(?:I|1)\s*[,\-–]\s*(?:[Ss]oftware|[Dd]ata|[Hh]ardware|ML|AI)\b/;

/** Level II (mid). Roman numerals are matched case-sensitively ("II" but not "ii" in a word). */
const NEG_MID = /\bII\b|\b(?:[Ee]ngineer|[Dd]eveloper|SDE|SWE|[Aa]nalyst|[Ss]cientist)\s*2\b/;
const NEG_SENIOR_ROMAN =
  /\b(III|IV)\b|\b(?:[Ee]ngineer|[Dd]eveloper|[Aa]nalyst|[Ss]cientist|[Mm]anager|[Ss]pecialist)\s*[3-6]\b/;
const NEG_SENIOR =
  /\b(senior|sr\.?|snr|staff|principal|lead|leader|architect|expert|distinguished|fellow|confirm[ée]e?|exp[ée]riment[ée]e?|s[ée]nior)(?![\wÀ-ÿ])/i;
/** "Member of Technical Staff" is an entry-friendly title at AI labs, not a Staff level. */
const NOT_STAFF_LEVEL = /\b(?:technical staff|staff(?:ing)? (?:nurse|accountant|assistant))\b/i;
const NEG_MANAGER =
  /\b(manager|director|teamleiter(?:in)?|leiter(?:in)?|directeur|directrice|head of|vp|svp|evp|vice president|chief|cto|ceo|cfo|president|executive director|managing director|supervisor|superintendent|responsable)\b/i;
/** Manager words that name a function, not a seniority ("Product Manager"). */
const FUNCTION_MANAGER =
  /\b(?:product|program|project|account|community|content|marketing|office|case|property|social media|brand|category) manager\b/gi;

function positive(title: string): string | null {
  const strong = title.match(POSITIVE);
  if (strong) return strong[0];
  if (GRADUATE_NOT.test(title)) return null;
  const g = title.match(GRADUATE);
  return g ? g[0].replace(/^[-–,|(:/\s\d]+/, "") : null;
}

function levelOne(title: string): string | null {
  return (title.match(LEVEL_ONE) ?? title.match(LEVEL_ONE_PREFIX))?.[0] ?? null;
}

function senior(title: string): { seniority: Seniority; word: string } | null {
  const t = title.replace(NOT_STAFF_LEVEL, " ");
  const manager = t.replace(FUNCTION_MANAGER, " ").match(NEG_MANAGER);
  if (manager) return { seniority: "manager", word: manager[0] };
  const s = t.match(NEG_SENIOR);
  if (s) return { seniority: "senior", word: s[0] };
  const roman = t.match(NEG_SENIOR_ROMAN);
  if (roman) return { seniority: "senior", word: roman[0] };
  const mid = t.match(NEG_MID);
  if (mid) return { seniority: "mid", word: mid[0].trim() };
  return null;
}

/** True when the title is clearly not a full-time new-grad role (senior or internship). */
export function isClearlyNotNewGrad(title: string): boolean {
  return INTERN.test(title) || senior(title) !== null;
}

// ---------- description: years of experience ----------

const NUM_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
};
const N = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|un|une|deux|trois|quatre|cinq)`;
/** "3+ years of experience", "3-5 years' professional experience", "at least 4 yrs in ...". */
const YEARS_EN = new RegExp(
  String.raw`\b${N}\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)\b[^.;\n]{0,70}?\bexperience`,
  "gi",
);
/** "experience: 5+ years", "experience of at least 3 years". */
const YEARS_EN_AFTER = new RegExp(
  String.raw`\bexperience\b[^.;\n]{0,30}?\b(?:of|:)?\s*(?:at least|minimum(?: of)?|min\.?)?\s*${N}\s*\+?\s*(?:years?|yrs?)\b`,
  "gi",
);
/** "3 ans d'expérience", "au moins 5 années d'expérience". */
const YEARS_FR = new RegExp(
  String.raw`\b${N}\s*\+?\s*(?:(?:-|–|à)\s*\d{1,2}\s*)?(?:ans?|ann[ée]es?)\b[^.;\n]{0,50}?\bexp[ée]rience`,
  "gi",
);

function toNum(s: string): number {
  return NUM_WORDS[s.toLowerCase()] ?? Number(s);
}

/** Minimum years of experience required by the description (null when none found). */
export function yearsRequired(description: string | null | undefined): number | null {
  if (!description) return null;
  const text = description.slice(0, 20_000);
  let min: number | null = null;
  for (const re of [YEARS_EN, YEARS_EN_AFTER, YEARS_FR]) {
    for (const m of text.matchAll(re)) {
      const n = toNum(m[1]!);
      // > 20 is a company boast ("50 years of experience serving clients"), not a requirement.
      if (!Number.isFinite(n) || n > 20) continue;
      min = min === null ? n : Math.min(min, n);
    }
  }
  return min;
}

// ---------- classifier ----------

const HINT_REASON = {
  entry: "source : offre listée comme new grad / entry-level",
  intern: "source : stage / étudiant",
  experienced: "source : poste « experienced »",
  executive: "source : poste de direction",
} as const;

const INTERN_CONTRACT = /\b(intern|internship|stage|co-?op|apprentice|working student)/i;

export function classifyNewGrad(job: NewGradInput): NewGradVerdict {
  const title = job.title.trim();
  const years = yearsRequired(job.descriptionText);
  const v = (
    isNewGrad: boolean | null,
    seniority: Seniority | null,
    reason: string,
  ): NewGradVerdict => ({ isNewGrad, seniority, reason, yearsRequired: years });

  // 1. Internship / co-op / student job: not wanted (full-time only).
  const intern = title.match(INTERN);
  if (intern) return v(false, "intern", `titre : « ${intern[0]} » (stage)`);
  if (job.employmentType && INTERN_CONTRACT.test(job.employmentType))
    return v(false, "intern", `type de contrat : ${job.employmentType}`);
  if (job.seniorityHint === "intern") return v(false, "intern", HINT_REASON.intern);

  const strong = positive(title);
  const weak = strong ? null : levelOne(title);
  const neg = senior(title);

  // 2. Title says both ("Junior/Senior Engineer", "Graduate ... Director"): ambiguous, unless the
  //    positive marker is only a level-one ladder ("Lead Engineer I" is a lead).
  if ((strong || weak) && neg) {
    if (strong && neg.seniority !== "mid")
      return v(null, null, `titre ambigu : « ${strong} » et « ${neg.word} »`);
    return v(false, neg.seniority, `titre : « ${neg.word} »`);
  }
  // 3. Senior / manager / level II+ title.
  if (neg) return v(false, neg.seniority, `titre : « ${neg.word} »`);
  // 4. Positive title marker. The description only overrides it when clearly senior.
  const pos = strong ?? weak;
  if (pos) {
    if (years !== null && years >= 5)
      return v(null, "entry", `titre « ${pos} » mais ${years} ans d'expérience demandés`);
    return v(true, "entry", `titre : « ${pos} »`);
  }
  // 5. Source hint (curated new-grad list, entry-level filter, ATS seniority field).
  if (job.seniorityHint === "entry") {
    if (years !== null && years > 2)
      return v(null, "entry", `${HINT_REASON.entry} mais ${years} ans d'expérience demandés`);
    return v(true, "entry", HINT_REASON.entry);
  }
  if (job.seniorityHint === "executive") return v(false, "manager", HINT_REASON.executive);
  // 6. Description: years of experience required (> 2 years = not new grad).
  if (years !== null && years > 2)
    return v(false, years >= 5 ? "senior" : "mid", `description : ${years} ans d'expérience`);
  if (job.seniorityHint === "experienced") return v(false, "mid", HINT_REASON.experienced);
  if (years !== null && years <= 1)
    return v(true, "entry", `description : ${years} an d'expérience demandé au plus`);
  return v(
    null,
    null,
    years !== null ? `description : ${years} ans d'expérience (indécis)` : "aucun indice",
  );
}
