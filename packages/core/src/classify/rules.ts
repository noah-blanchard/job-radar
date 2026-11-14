/**
 * Title rules (spec section 8). M1 only uses the negative list to skip costly per-job detail
 * requests; the full classifier comes in M3.
 */

// Roman numerals are matched case-sensitively ("II" but not "ii" in a word).
const NEG_ROMAN = /\b(II|III|IV)\b/;
const NEG_WORDS =
  /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|architect|intern|internship|co-?op|stage|stagiaire|vp|vice president|chief)\b/i;

/** True when the title is clearly not a full-time new-grad role (senior or internship). */
export function isClearlyNotNewGrad(title: string): boolean {
  return NEG_ROMAN.test(title) || NEG_WORDS.test(title);
}
