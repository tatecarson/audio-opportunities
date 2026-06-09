# Suggested Minors per Sector — Design

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation

## Goal

Help Digital Sound Design (DSD) students at DSU see which **minors** would
better prepare them for a given audio career field. The DSD major doesn't cover
everything (e.g. heavy programming, networking, physics); a well-chosen minor
fills the gap. We surface, in the employer detail panel, a "Suggested DSU
minors" block derived from the employer's **sector**.

## Decisions

- **Mapping unit:** Sector / field (not per-employer, not per-role). One mapping
  per Sector option; every employer in that sector shows the same minors.
- **Placement:** Employer **detail panel** only (reuses existing UI).
- **Source of truth:** Airtable, fetched at build time like everything else.
- **Verification gate:** A minor only appears once its `Last Verified` date is
  set — consistent with Employers/Programs.

## Data model — new Airtable table `Minors`

(base `appyqRTTdm4p0Ze0P`)

| Field | Type | Purpose |
|---|---|---|
| `Minor Name` | single line | e.g. "Computer Science Minor" |
| `Relevant Sectors` | multipleSelects | Sector option names this minor supports (mirrors Employers `Sector` choices) |
| `Why It Helps` | long text | one student-facing sentence |
| `Catalog URL` | url | link to the DSU catalog page for the minor |
| `Last Verified` | date | display gate (set by Tate) |

## Verified sector → minor mapping

Each minor below was checked against its actual DSU catalog course list
(catoid=44). Catalog titles were misleading in several cases — see "Flags".

| Sector | Minor(s) |
|---|---|
| AV Systems Integration | Network & Security Administration; Project Management |
| Automotive & Embedded Audio | Computer Science; Applied Math |
| Generative & AI Audio | Computer Science; AI & Machine Learning *(ambitious)* |
| Voice & Conversational AI | Computer Science; AI & Machine Learning *(ambitious)* |
| Audio Software/Tools | Computer Science; Mobile App Development; High-Performance Computing |
| Acoustics Consulting | Physics; Applied Math |
| Audio Test & Measurement | Physics; Applied Math |
| Spatial & Immersive Audio | Physics; Computer Science |
| Hearing Health & Audiology | Physics; Biology; Computer Science |
| Bioacoustics & Soundscape | Biology (Ecology/Conservation electives); Computer Science |
| Forensic Audio | Digital Forensics *(computer forensics — adjacent)*; Project Management |
| Localization & Dubbing | Spanish; English for New Media |
| Accessibility & Captioning | English for New Media; Communication Studies |
| Audiobooks & Spoken-Word | English; Communication Studies; Digital Content Creation |
| Post-Production | Video Production |
| Broadcast | Video Production |
| EdTech & Learning Media | Video Production; Digital Content Creation |
| Podcast/Radio | Digital Content Creation; Communication Studies |
| Sonic Branding | Digital Content Creation; Marketing |
| Recording Studios | Entrepreneurial Studies; Marketing |
| Music Licensing | Entrepreneurial Studies; Marketing |
| Music Tech | Computer Science; Entrepreneurial Studies |
| Games | Computer Science |
| Simulation & XR Training | Computer Science |
| Theme Parks | Computer Science; Project Management |
| VR/AR | Computer Science |

### Flags (from reading actual courses)
- **Educational Technology Minor (K-12)** — NOT usable; requires a DSU
  teaching-licensure education degree. Excluded.
- **Cyber Operations** — excluded; offensive security/malware/RE, no audio tie.
- **Digital Forensics** — computer/disk forensics, not audio; label honestly.
- **Animation minors (Computer Graphics, 2-D/3-D Production)** — excluded;
  visual/art, not audio-skill prep.
- **Bioinformatics vs Biology** — Biology is the real Bioacoustics match.
- **AI & Machine Learning** — strong but prereq-heavy (needs CS foundation);
  label "ambitious."
- **Physics / Applied Math** — calculus-based and demanding; note workload.

## Data flow / code changes

`src/lib/airtable.ts`
- Add `Minor` interface and `getMinors()` (filter by `Last Verified`, like the
  others). Parse `Relevant Sectors` via existing `names()` helper.
- Build a `sector -> Minor[]` index, or attach a `minors: Minor[]` array to each
  `Employer` by intersecting `employer.sectors` with each minor's sectors.

`src/pages/index.astro`
- Include each employer's matched minors in the `data-detail` JSON payload as a
  structured `minors: { name, why, url }[]` array (deduped, sorted).

`src/components/DetailPanel.astro` + `src/scripts/directory.ts`
- Render a new "Suggested DSU minors" section in the panel: each minor as a
  linked name (catalog URL) with its "why" line. Omit the section when empty.

## Out of scope (YAGNI)
- No filtering/faceting by minor.
- No dedicated minors page (detail panel only).
- No per-employer overrides.

## Catalog URLs (verified 2026-06-09, catoid=44)

Base: `https://catalog.dsu.edu/preview_program.php?catoid=44&returnto=2444&poid=<poid>`

| Minor | poid |
|---|---|
| Computer Science | 3763 |
| Artificial Intelligence and Machine Learning | 3828 |
| Mathematics, Applied | 3730 |
| Network and Security Administration | 3768 |
| Computer Information Systems | 3760 |
| Project Management | 3825 |
| Digital Forensics | 3759 |
| Cyber Operations *(excluded)* | 3761 |
| Computer Graphics *(excluded)* | 3726 |
| Production Animation 3-D *(excluded)* | 3808 |
| Production Animation 2-D *(excluded)* | 3807 |
| Physics | 3733 |
| Biology | 3724 |
| Spanish | 3736 |
| English for New Media | 3806 |
| Communication Studies | 3847 |
| Web Development | 3805 |
| Mobile Application Development | 3764 |
| Video Production | 3849 |
| Digital Content Creation | 4002 |
| Multimedia/Web Design | 3732 |
| Entrepreneurial Studies | 3765 |
| Marketing | 3823 |
| Educational Technology (K-12) *(excluded — needs teaching licensure)* | 3781 |
| High-Performance Computing | 3766 |
| Bioinformatics *(Biology preferred)* | 4007 |
| English | 3728 |
| History | 3729 |
| Business Administration | 3756 |

## Follow-up research (separate task)
Explore additional career sectors that *combinations* of DSD + a minor unlock
(e.g. DSD + CS → audio tools engineering; DSD + Biology → bioacoustics research)
— may surface new sectors worth adding to the directory.
