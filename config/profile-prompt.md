You are going to interview me, then write my `profile.yaml` for **job-radar**, a personal job-hunting tool.

job-radar collects job postings from company career pages and from job aggregators (Jooble, Adzuna, JSearch). My `profile.yaml` does two jobs at once, and you must write it with both in mind:

1. **Scoring.** Every posting gets a score from 0 to 100 against this file. A good profile puts the jobs I actually want at the top and buries the rest.
2. **Searching.** The searches sent to the aggregators are built from this same file. A keyword that scores well but makes a bad search term brings in noise or nothing at all.

I'm not a recruiter. I don't know every job title or how postings are worded, so propose titles and keywords, don't wait for me to list them.

# The interview

- Reply in the language I write in. Keys stay in English; ask me which language I want for the YAML comments.
- Ask 3 to 5 questions at a time, one topic per batch, in the order below. Wait for my answers before moving on.
- When an answer is vague ("I like DevOps"), dig: which tools, what kind of work day, what I've actually built, what I'd hate doing. Offer concrete options to pick from.
- Point out conflicts (e.g. "remote only" and "new grad": few such jobs exist) and limits of the tool (listed below) as soon as they come up, and ask how I want to handle them.
- Write no YAML until the interview is done. Then show a short summary of what you understood and wait for my OK.

Topics:

1. **Background**: degree, school, graduation date, internships, jobs, projects, certifications.
2. **Level**: new grad / junior only, or also intermediate, senior, manager?
3. **Domains**: which fields I want, and for each one whether it's a *main* domain or a *secondary* one ("only if nothing better"). For each: tools I know or want to use, job titles that fit (suggest some).
4. **Never**: titles or kinds of work that must score 0 (help desk, sales, internships if I've graduated...).
5. **Location and work authorization**: countries, cities, remote / hybrid / on-site, relocation, citizenships and permits. What is ideal, what is acceptable, what is a no.
6. **Languages**: the ones I can work in, and the languages postings are written in where I search. If postings come in two languages (e.g. English and French in Québec), every keyword must cover both.
7. **Companies**: dream companies to boost, companies to block.
8. **Strictness**: should a job with none of my keywords in its title be buried, or do I still want to see generic titles ("Software Engineer, New Grad")?

Don't ask me for search queries: propose them yourself from my answers.

# How the score works

```
score = location (0-30) + level (0-25) + domains (0-25) + language (+5 / -10) + bonuses, kept between 0 and 100
```

**Location (0-30).** The `weight` of the FIRST rule in `locations` that matches. No rule matches: 0.

**Level (0-25).** The tool gives each posting a level, mostly from the title:

- `intern`: intern, internship, co-op, stage, stagiaire, alternance, apprenti, working student
- `entry`: junior, jr, new grad, graduate, entry level, early career, trainee, débutant, jeune diplômé, "Engineer I"; or a description asking for 1 year or less
- `mid`: "II", "Engineer 2"; or a description asking for 3 or 4 years
- `senior`: senior, sr, staff, principal, lead, architect, expert, "III"; or 5+ years
- `manager`: manager, director, head of, VP, chief, responsable (but "product / project / program / account manager" are not manager-level)
- unknown: no clue (a plain "Data Analyst" with no years stated). This is the most common case.

Level in `target_seniority`: 25 points. Unknown: 10 points. Any other level: 0 points and **the whole score is capped at 20**.

**Domains (0-25).** For each keyword of each domain: 2 hits if it matches the title, plus 1 hit if it matches the description (so 3 if both). Each hit is worth 3 points. The total over all domains is capped at 25. Three things follow:

- A keyword counts **once**, however many times it appears and however many of its `|` alternatives match. `'power bi|looker|qlik'` is one keyword: a posting naming all three tools gets 1 hit. Three separate keywords would give 3 hits.
- So: put **synonyms and translations of one concept in one keyword** (`'data analyst|analyste de données'`), otherwise a bilingual posting counts the same thing twice. Put **different concepts in separate keywords**.
- **The order of domains does not change the score.** A keyword of the last domain is worth the same 3 points as one of the first. The only way to prefer a domain is the number and precision of its keywords: 10 to 15 separate keywords for a main domain, 3 to 5 very specific ones for a secondary domain.

**Language.** The posting's language and every language it requires are all in my `languages`: +5. Any of them is not: -10. So `languages` must list every language I can work in.

**Bonuses.** +10 for a company in `priority_companies`, +5 if the posting is less than 24 hours old, +3 if a salary is listed.

**Exclusions and caps.**

- `exclude_title` matches the title, or the company is in `exclude_companies`: score 0.
- `require_domain: title`: no domain keyword in the title → capped at 20. `require_domain: true`: capped at 20 only if no keyword in the title AND fewer than 2 keywords of a same domain in the description. `false`: no cap.

A typical very good job with no bonus: 30 + 25 + 25 + 5 = 85. The same job with an unknown level: 70.

# How the aggregator searches are built

- **`search_titles`** are sent as they are. Jooble searches each one in Canada, in the United States (only if those countries are in my `locations`) and in "Remote" (only if I have a `remote: true` rule). JSearch searches `"<title> in <place>"`, best place first, but runs only about **3 searches per day**: in practice the first `search_titles` at my highest-weight place. So **order `search_titles` from most to least important**.
- **The first keyword of each domain** becomes a Jooble search: `junior` + the first `|` alternative of that keyword, with the regex syntax stripped. `'data analyst|analyste de données'` → `junior data analyst`. So the first alternative of the first keyword of every domain must be **a plain, common job title or term, with no regex syntax**: `'devops engineers?'` would search "junior devops engineers", and `'pen(etration)? test(ing|er)?'` would search "junior penetration testing er".
- **All the words of all the keywords of a domain** become one Adzuna "any of these words" search, combined with a junior word in the title (junior, graduate, new grad, entry level; in France: junior, débutant, jeune diplômé). A few job nouns (engineer, developer, ingénieur...) and small words are dropped automatically. Everything else is searched, so a keyword like `'data analyst'` also searches the bare word "data".
- **The order of domains matters here** (and only here): daily quotas are spent in order, so the first domains are searched first.
- The place JSearch uses is my highest-weight location rule: the name of the country for a `country` rule (only CA, US, FR, GB and DE have one), or the first unaccented alternative of a `match` rule. Put my main city first in `match`.

Limits to tell me about when they apply:

- Domain searches always add "junior". If I target `mid` or `senior`, only `search_titles` can bring the right level from the aggregators, so word them accordingly ("senior data engineer").
- Outside Canada, the US, France, the UK and Germany, the aggregators find little: my results will come mostly from company career pages.
- The tool cannot target internships: they are always an off-target level (capped at 20). `exclude_title` only decides whether they drop to 0.

# The file format

The YAML is checked against a strict schema: a wrong type rejects the whole file, an unknown key is ignored.

| Key | Type | Meaning |
|---|---|---|
| `grad_date` | string `"YYYY-MM"` | For reference only, not scored. |
| `seniority` | string | Free text, for reference only (e.g. `new_grad`). |
| `target_seniority` | list, 1 or more of `entry`, `mid`, `senior`, `manager` | Levels I want. |
| `require_domain` | `false`, `true` or `title` | See "Exclusions and caps". With `title`, every job I want must have a keyword in its title, so the domains need job-title keywords, including the generic titles I'd accept. |
| `search_titles` | list of 3 to 8 plain-text strings | Aggregator searches, most important first, in each language I search in. |
| `locations` | list of rules | See below. |
| `domains` | map: `snake_case_name` → list of keywords | See below. Main domains first. |
| `languages` | list of ISO 639-1 codes | e.g. `[fr, en]`. |
| `work_auth_note` | string | Free text, for reference only. |
| `priority_companies` | list of names | +10. Names as written on postings; case, accents and suffixes like "Inc." don't matter. |
| `exclude_companies` | list of names | Score 0. |
| `exclude_title` | list of regex | A match in the title → score 0. |

## `locations`

Each rule: `{ match: '<regex>', country: <ISO 3166-1 alpha-2>, remote: true, weight: <0-30> }`. `weight` is required, plus at least one of the three conditions. All the conditions of a rule must hold.

- `country`: compared with the country parsed from the posting (`CA`, `US`, `FR`, `GB`, `DE`...).
- `match`: regex tested on the posting's city, region and raw location text. Accents and case are ignored. **No word boundaries are added here**: `'US'` matches "Brussels" and `'UK'` matches "Milwaukee", so write `'\bUK\b'` for short tokens. Use `match` for cities, for regions (`'Europe|EMEA'`), and as a safety net when the country isn't parsed (`'Canada|Toronto'`).
- `remote: true`: the posting must be fully remote (hybrid doesn't count). Never write `remote: false`: it does not mean "on site", it means nothing.
- **The first matching rule wins**, so go from most specific to most general: `remote + country` before `country`, a city before its country. A rule that can never be reached (placed after a more general one) is a mistake. A low-weight rule placed early is the way to mark down one city inside a country I like.
- A rule with only `remote: true` matches remote jobs anywhere, often "US only": score it low if I can't work in the US.

## Keywords (`domains` and `exclude_title`)

Each keyword is a **JavaScript regex**, case-insensitive, with Unicode rules.

- **Whole words, automatically.** `aws` doesn't match "laws". Don't add `\b`. The other side of this: `'data analyst'` does NOT match "Data Analysts", and `'ingénieur'` does NOT match "Ingénieure". Add the endings yourself: `'data analysts?'`.
- **Accents are NOT ignored** (unlike `locations`). Postings are written with and without them: write `'donn[ée]es'`, `'d[ée]veloppeur'`, `'ing[ée]nieur'`.
- **French inclusive forms**: `'ing[ée]nieur[(.·e)]*'` matches Ingénieur, Ingénieure, Ingénieur(e), Ingénieur·e; `'d[ée]veloppeu[rs][(.·eus)]*'` matches Développeur, Développeuse, Développeur(euse), Développeur·euse.
- **Escapes.** Escape only regex characters: `'node\.js'`, `'c\+\+'`, `'\.net'`. Never escape anything else: `'c\#'`, `'ci\-cd'`, `'r\&d'` are invalid and **the keyword is silently dropped**. Write `'c#'`, `'ci/cd|ci-cd'`, `'r&d'`.
- **Apostrophes**: use `.` (`'centre d.appels'`), which also matches the curly apostrophe.
- **YAML**: every regex in **single quotes** (in double quotes, `\b` and `\.` break).
- **No word that is too short or too generic** as a keyword on its own: `go`, `r`, `sql`, `data`, `security`, `cloud`, `python`, `analyst`, `management`. They match unrelated jobs, and with `require_domain: title` they let those jobs through. Prefer `'golang'`, `'cloud security'`, `'sql server|postgres(ql)?|mysql'`.
- **Words that mean something else in the other language**: `tableau` (a table, in French), `express`, `stage` (an internship in French, a step in English), `lead`. Pin them down: `'tableau (desktop|server|software)'`, `'express\.?js'`.
- **Mix job titles and tools.** Title keywords are the strongest signal (they are the ones found in titles, worth double, and they open the `require_domain` gate). Tools separate real fits from near misses in the description.
- **One domain per concept.** The same keyword in two domains counts twice.

`exclude_title` follows the same rules and is tested on the title only. A match kills the job, so never exclude a word found in titles I want: not `support` if I'd take "Cloud Support Engineer", but `'help ?desk|it support technician'`. Senior / lead / manager need no exclusion: `target_seniority` already caps them. Give both languages here too.

## Format example (shortened, made-up person: bilingual data analyst in Montréal)

```yaml
# job-radar profile: <name>
# score = location (0-30) + level (0-25) + domains (0-25) + language (+5/-10) + bonuses

grad_date: "2026-12"
seniority: new_grad
target_seniority: [entry]
require_domain: title          # only data titles: bury everything else

# Aggregator searches, most important first (JSearch only runs the first few each day)
search_titles:
  - entry level data analyst     # not "junior data analyst": the first domain already sends that one
  - analyste de données junior
  - business intelligence analyst

# The FIRST matching rule wins: specific before general
locations:
  - { remote: true, country: CA, weight: 30 }
  - { match: 'Montreal|Laval|Longueuil', weight: 30 }       # home; accents are ignored here
  - { country: CA, weight: 22 }                             # would relocate
  - { match: 'Canada|Toronto|Ottawa|Vancouver', weight: 22 } # safety net: country not parsed
  - { remote: true, weight: 10 }                            # remote elsewhere, often US-only

domains:
  # Main domain: many separate keywords. Its first alternative is a Jooble search: "junior data analyst"
  data_analytics:
    - 'data analyst|data analysts|analystes? (de|des) donn[ée]es'
    - 'business intelligence|bi (analyst|developer)s?|intelligence d.affaires|informatique d[ée]cisionnelle'
    - 'power bi'
    - 'looker|qlik'
    - 'tableau (desktop|server|software)'                   # bare "tableau" is a French everyday word
    - 'dashboards?|tableaux? de bord'
    - 'sql server|postgres(ql)?|mysql|bigquery|snowflake'    # bare "sql" is in every developer posting
    - 'data visuali[sz]ation|visualisation (de|des) donn[ée]es'
    - 'dax|power query'
    - 'kpis?|indicateurs? de performance'
  # Secondary domain: few, very specific keywords
  data_engineering:
    - 'data engineer|data engineers|data engineering|ing[ée]nieur[(.·e)]* (de|des) donn[ée]es'
    - dbt
    - 'etl|elt'
    - 'airflow|dagster'

languages: [fr, en]
work_auth_note: "Canadian citizen. No US work authorization."

priority_companies:
  - "Shopify"
exclude_companies: []

exclude_title:
  - 'intern(ship)?s?|stagiaire|co-?op'                      # graduated: from "capped at 20" to 0
  - 'sales|ventes?|account executive'
  - 'help ?desk|call cent(er|re)|centre d.appels'
```

How two postings score against this example:

- **"Junior Data Analyst"**, Montréal, hybrid, in English, description naming "data analyst", Power BI, SQL Server and dashboards. Location 30 (Montreal rule) + level 25 ("junior") + domains 18 (`data analyst`: 2 for the title + 1 for the description; `power bi`, `sql server`, `dashboards`: 1 each; 6 hits × 3) + language 5 = **78**.
- **"Data Engineer"**, Toronto, on site, description asking for 3 years of experience, naming dbt and Airflow. Location 22 + level 0 (3 years = `mid`, not targeted) + domains 12 + language 5 = 39, **capped at 20**.

# What to give me at the end

1. **The complete `profile.yaml`** in one code block, with short comments saying why each choice was made.
2. **The searches it will send**: every `search_titles` entry in order, the `junior <term>` search of each domain, and the place JSearch will use. Check that each one reads like something a person would type into a job site, and that no two are the same (a `search_titles` entry equal to a domain's `junior <term>` wastes a search).
3. **A self-check**, done before you send and reported in a few lines:
   - valid YAML, only the keys above, every regex single-quoted and valid in JavaScript with no forbidden escape;
   - the first alternative of the first keyword of every domain is plain text;
   - every keyword covers each language I search in, plural and feminine forms, with and without accents;
   - one concept per keyword, no concept in two keywords or two domains, no over-generic keyword;
   - nothing in `exclude_title` kills a title I want;
   - location rules go from specific to general and none is unreachable;
   - with `require_domain: title`, every title I said I want contains a keyword.
4. **A dry run**: 6 realistic postings (title, location, 2 lines of description, language), at least one in each language I search in: 2 great fits, 2 borderline, 1 off-level, 1 unwanted. Score each by hand with the full breakdown, the way the two examples above are scored. If a job I'd want lands under 50 or one I'd refuse lands over 50, fix the profile before showing it to me.

Then ask what I'd like to adjust, and tell me to paste the file into job-radar's Settings page.

Start now with the first batch of questions.
