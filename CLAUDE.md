# CLAUDE.md — Fortune's Weave Class & Recruitment Planner

## 1. What you are building

You are building a static web app, hosted on GitHub Pages, for planning character builds in **Fire Emblem: Fortune's Weave** (Nintendo Switch 2, released 17 Sep 2026).

The user wants to answer two questions:

1. **Who should I recruit on each of the four Part I routes** (Cai, Dietrich, Theodora, Leda)?
2. **For each character, which sequence of classes should they level through**, so they end in the best final ("ending") class with the best stats?

The app needs two modes:

- **Manual mode:** the user picks the classes a character goes through, and the level ranges spent in each. The app projects the resulting growths and stats.
- **Optimize mode:** the app computes and presents the class route that maximises a user-selected stat objective, given the character's route, join level, mounts and class restrictions.

The math must account for three things:

- **(a)** The level a character joins at on each route. Recruits are auto-levelled to that point, and their auto-levelled stats are worse than if you had trained them yourself (see §4.3).
- **(b)** Class growth modifiers.
- **(c)** Mount growth bonuses while in a mounted class. These are multiplied by the class's mount multiplier (see §4.2).

### Deliverables

1. A new GitHub repo, created with the `gh` CLI using this current folder. Make it public, because GitHub Pages on a free account needs a public repo.
2. The web app source.
3. A GitHub Actions workflow that builds the app and deploys it to GitHub Pages on every push to `main`.
4. A `README.md` covering how to use the app, the data sources, and the known uncertainties.
5. Unit tests for all growth and stat math.

Before creating the repo, ask the user to confirm the repo name and visibility, and confirm that `gh auth status` is logged in.

---

## 2. Input data files (provided by the user)

Copy all of these into `data/raw/` unchanged. Then write a build-time script (`scripts/build-data.ts`, or Python if simpler) that parses them into normalised JSON in `src/data/*.json`.

Never hand-edit the generated JSON. Fix the parser, or add a manual override file (`data/overrides.json`) instead.

| File | Format | Contents |
|---|---|---|
| `char_growths.txt` | TSV | Personal growth rates (%) for 63 characters. Columns: `Name HP Str Mag Spd Dex Def Res Lck Cha` |
| `class_growths.txt` | TSV | Growth modifiers (%) for 60 classes, added to personal growths. Same 9 stat columns, then 7 mount-multiplier columns: `Horse Ornius Pegasus Bau Elephant Wyvern Griffon`. Then `Tier`, `Ideal_Exam_Level`, `Renown_Req`. No mount species currently uses the `Wyvern` or `Griffon` columns |
| `class_passive_growths.txt` | TSV | Level-gated growth bonuses from class abilities: Charioteer's Path at Lv 35 and Lv 45, and Elephant Rider's Path at Lv 45 |
| `mount_growths.txt` | TSV | Growth bonuses (%) at Bond 5 for 20 mounts. Columns: `Mount_Species Mount_Subtype HP_Growth … Cha_Growth` |
| `base_stats.txt` | TSV | Base stats for 18 story characters, with base level and starting class. Columns: `Name Level Starting_Class HP Str Mag Spd Dex Def Res Lck Cha Source` |
| `DATA_NOTES.md` | Markdown | Where every value came from, what was corrected, and which values are still disputed. Read this before touching the data |
| `recruitment_table.md` | Markdown table | Recruitment requirements per character per route: Support level, Renown level, extra condition, Auto Recruit or Unrecruitable |
| `recruitment_join_estimates.md` | Markdown | Estimated join chapter and join level per character per route, plus the Renown→chapter and chapter→level curves |

### Parsing notes

**Stat column order differs between sources.**
- The TSVs use `HP Str Mag Spd Dex Def Res Lck Cha`.
- The Fandom wiki's base-stat tables use `HP Str Mag Dex Spd Lck Def Res Cha`.
- Normalise everything to a single canonical order, and map columns by header name, never by position.

**Cell formats in `recruitment_table.md`:**
- `Support 3 \| Renown 8<br>*(Requires 3,000 Gold)*`
- `**Auto Recruit**<br>*(Chapter 4 Story)*`
- `Unrecruitable`
- Note the escaped pipe `\|` inside cells.

**Cell formats in `recruitment_join_estimates.md`:**
- `Ch 8 · ~20`
- `Ch 9–10 · ~27–31` (the dash is an en dash `–`)
- `Auto (Ch 4)* · ~6`
- `Auto (Ch 1) · **Lv 1** ✓`
- `Auto (by Ch 3) · ~2–4`
- `Auto (Tutorial, ~Ch 3–4) · ~4–6`
- `~Ch 12 · ~37 †`
- `—` (not recruitable)

**Markers in `recruitment_join_estimates.md`:**
- `†` means paralogue/story-gated.
- `‡` means the character appears in Dagsion only from a calendar date.
- `✓` means the level is confirmed.
- `*` means the chapter was corrected.

Keep these as boolean flags in the JSON. Store both ends of every range, as `levelMin`/`levelMax` and `chapterMin`/`chapterMax`.

**Mount multiplier columns in `class_growths.txt`** are floats: `0.0`, `1.0`, `2.0`.

**`Ideal_Exam_Level` values** can be `N/A` (Base tier), a number, or `None` (Divine tier).

**`Renown_Req` values** can be `N/A`, a number, or `Part 3`.

### Validation script

Add a validation script that fails the build if any of these checks fail:

- every character in the recruitment files exists in `char_growths`;
- every class referenced anywhere exists in `class_growths`;
- every row has 9 numeric stats.

The recruitment tables do not include these characters, but `char_growths` does:
- The lords: Eshmel, Cai, Dietrich, Theodora, Leda.
- The later-game joiners: Bertrand, Talimun, Orchel, Anatolia, Hong Hua, Troy, Centurio, Aswan, Nathan, Creek, Klapka, Tahonia.

Handle these as follows:

- **Lords:** each joins at Level 1 on their own route only.
- **Later-game joiners:** their join level is unknown. Default it to a user-editable value.

---

## 3. Game mechanics: established facts

These facts were researched from guides and player reports in early October 2026. The game cannot be data-mined, so some details come from player testing. Each section is marked with a confidence level.

### 3.1 Growth rates (HIGH confidence)

- On each level-up, every stat rolls separately. The chance of +1 is that stat's **total growth**.
- **Total growth = personal growth + current class modifier (+ mount bonus, see §4.2).** For example, Leda's 65% Spd plus Dancer's +25 gives 90%.
- The class modifier applies only while the unit is *in* that class. Growth is determined by the class held at the moment of the level-up, so the planner models the build as a sequence of level segments, each spent in one class.
- Growth rates are visible in-game, and the provided files reflect the in-game values.
- **Clamping:** clamp each total growth to the range [0, 100] (assumption: no evidence of negative or above-100% behaviour). Make the clamp a single constant so it can be changed later.

**Special case: Mu.** Her personal ability *Signs of Growth* raises her growths. Without the ability her growths are 30/30/5/30/30/20/10/10/20. The file holds the boosted values (50/50/25/50/50/40/30/30/40). The exact trigger condition isn't documented. Use the file values by default, and add a per-character toggle "Signs of Growth active".

### 3.2 Class tiers and certification exams (HIGH confidence)

Classes are not a promotion tree. Any unit can take the exam for any class it has unlocked. Each exam needs three things:

- the tier's **licence** item;
- the class's **weapon/skill rank requirements**;
- a **pass chance**, driven by level relative to the tier's *ideal level* and by skill ranks.

The ideal levels are **recommendations, not hard gates**. Exams below the ideal level are allowed, but the pass chance is worse.

| Tier | Ideal level | Hard gate |
|---|---|---|
| Base (Commoner, Noble) | — | No exam; starting class |
| Beginner | 5 | Beginner Licence |
| Specialty | 20 | Specialty Licence + **Renown 4** |
| Advanced | 35 | Advanced Licence + **Renown 8** |
| Master | 45 | Master Licence + **Part 3** (many also need a rebuilt temple and its quests) |
| Divine | none; exam only allowed at **100% pass chance** | Part 3, Section 4. Needs Diadem keys plus a class-specific item. **Only one unit may hold each Divine class at a time** |

**Dancer** is also exclusive: one holder at a time.

**Tier notes:**
- Charioteer is **Specialty**, confirmed by KeenGamer and Game8.
- Elephant Rider is **Advanced**, but it uses its own Elephant Licence and only unlocks in **Part 3**. Its `Renown_Req` is `Part 3` in the file.
- Make tiers overridable anyway, in case later sources disagree.

### 3.3 Route-exclusive class unlocks (MEDIUM confidence)

Some classes can only be unlocked on particular routes during Part I. Encode these as `unlockRoutes` with notes. Game8 states that a class unlocked on one path can be learned on other paths after it has been obtained. Default to: an unlock persists save-wide once earned. Keep a setting to turn that off.

| Class | Unlock | Known skill requirements |
|---|---|---|
| Shido, Warrior, Sniper | Automatic (Advanced) | Shido: Swords B. Warrior: Gauntlets B, Axes B, Swords B. Sniper: Bows B |
| Caladrius | Cai: Castor's Renown 7 lesson | Riding D, Black Magic B |
| Dragoon | Cai: Aurora's Renown 8 lesson; or Theodora Ch 11 supply quests | Flying C, plus Axe B or Spear B |
| Troubadour | Cai: Renown 10 lesson | Riding D, plus White or Black Magic B |
| Dancer | Leda: "Great Dancer's Successor", Ch 9 | Bows B, Swords B. Exclusive |
| Blacksmith | Dietrich only (Smyrnos, Renown 8) | Black Magic D, Axes C |
| Guardian | Dietrich (Il-Lara contract) or Theodora Ch 9 supply quests | ? |
| Cataphract | Theodora Ch 9 supply quests only | ? |

**Further skill requirements (Game8):**
- Archer: Bows C.
- Cataphract: Heavy Armor E+, Riding D, plus Axe B or Spear B.
- Elephant Rider: Riding C.
- Troubadour can also be unlocked on Leda's route via "Elegant Drink Recipes".
- Master classes:
  - Bow Adept: Bow A.
  - Sentinel: Spear A.
  - Druid: Black Magic A.
  - Wiseman: White Magic A.
  - Shadow Seeker: Bow A or Sword A.
  - Battlemaster: Gauntlet A, Axe A or Sword A.
  - Castle Knight: Heavy Armor C, plus Axe A or Spear A.
  - Great Knight: Heavy Armor D, Riding D, plus Axe A or Spear A.
  - Bau Lord: Flying C, plus Axe A or Spear A.
  - Celestial Trooper: Flying C, plus Spear A or Sword A.

**Beginner class requirements:**
- Gladiator: Gauntlets, Axe or Sword D.
- Hunter: Bows D, Swords D.
- Soldier: Axes D, Spears D.
- Ornius Rider: Riding E+, Axes D, Spears D.
- Diviner: Black or White Magic D.

All other skill requirements are unknown. Store them as `null`, and show the user an "unverified requirements" badge for those classes.

The app does **not** need to simulate weapon-rank growth. It should let the user tick "meets skill requirements" per class, and warn when the requirements are unknown.

### 3.4 Recruitment, Renown and chapters (MEDIUM–HIGH confidence)

- **What recruitment needs:** each Part I route has its own requirements per character: a Support level with that route's lord, a global Renown level, and often an extra condition. Some characters are Auto-recruited on certain routes; some are Unrecruitable.
- **What resets between routes:**
  - Renown and the recruited roster reset per route.
  - Support levels carry over across routes. Recruitment checks the Support level with the *current* lord.
- **Renown range:** Renown runs from 1 to 12. Renown 10 is enough to recruit everyone.
- **Renown pace:** most players hit max Renown around Ch 10 on every route. Dietrich is typically about one chapter slower unless the player grinds.
- **Part I length:** each Part I route has 12 chapters.

### 3.5 Join level vs chapter (MEDIUM confidence: estimated curve)

Use this chapter → typical army level curve, from walkthrough data (Neoseeker, Game8) plus one confirmed data point (Majide joined at Lv 17 in Cai Ch 7):

| Ch | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Lv | 1–2 | 3 | 4 | 6 | 9 | 13 | 17 | 20 | 27 | 31 | 35 | 37 |

- **Join level cap:** player reports say late recruits cap at about Lv 33–35 by Ch 12.
- **Earliest join chapter:** `recruitment_join_estimates.md` gives the *earliest* likely join chapter per character per route.
- **Recruiting later:** the user may deliberately recruit later. If they do, the join level follows the curve at the chosen chapter.
- **UI:** expose a "recruit at chapter" control per character per route.
  - Default: the earliest estimated chapter.
  - The control should not go below that earliest chapter.
- **Unverified mechanism:** it is unconfirmed whether recruits join at a fixed level per chapter or scale to the army's level. Make the curve editable in Settings, and allow a per-character manual join level override.

### 3.6 Part III merging (HIGH confidence; Phase 2 feature)

- Every character must be re-recruited in Part III, with no requirements this time. You choose which route's version to bring forward as the base.
- After Part III Section 1, **Merge Causality** costs 300 Karma Shards per character. It merges another route's version into the Part III unit.
  - Each stat takes the higher of the two versions.
  - Skill ranks, combat arts and mastered abilities also carry over.
- This means recruiting the same character on several routes, and building different stats on each, can produce a stronger final unit.

---

## 4. The stat model (implement exactly; unit-test every function)

### 4.1 Core expected-value model

Work in **expected values**: a growth of g% contributes g/100 per level. Optionally show variance. The number of stat-ups is binomial, so for n levels at probability p the standard deviation is √(n·p·(1−p)). Show it as a ± band.

```
expectedStat(char, plan, targetLevel, stat) =
    baseStat(char, stat)                                   // at the character's base level
  + autoLevelGains(char, route, joinLevel, stat)           // §4.3
  + Σ over each level-up L in (joinLevel, targetLevel]:
        clamp(totalGrowth(char, classAt(L), mountAt(L), stat), 0, 100) / 100
  + flatMountBonus(mountAt(target), bond, stat)            // optional, display only
```

**Level-up timing:** the class held at a level-up is the class in force *before* that level is gained. Pick one convention, document it in code, and apply it everywhere.

**Base stats:** `base_stats.txt` holds fixed base stats for 18 story characters: the lords plus every route's starting and story auto-recruits. These were re-ordered from the Fandom wiki's `HP Str Mag Dex Spd Lck Def Res Cha` order.

**Recruitable characters (Io, Catania, Kiroc and so on) have no fixed base stats.** They are auto-levelled to the point you recruit them, so no guide publishes a single base row for them. The user can add rows from their own save. When base stats are missing, the app shows **"stat gained since base"** instead of absolute stats. **Optimize mode must not depend on base stats**: it ranks plans on growth-derived gains only.

### 4.2 Mount growth bonus (MEDIUM confidence)

**Formula:**

```
mountGrowth(class, mount, bond, stat) =
    mount.growth[stat] * class.mountMultiplier[mount.species] * bondFactor(bond)
```

- **`class.mountMultiplier[species]`** comes from the 7 mount columns of `class_growths.txt`.
  - `0.0` means the class cannot use that species, so the bonus is zero.
  - `1.0` is normal.
  - `2.0` is Charioteer with a horse: player reports say Charioteer doubles the paired mount's growths.
- **`bondFactor(bond)`** is `bond / 5`.
  - The `mount_growths.txt` values are at Bond 5.
  - Each bond rank gives +1 to a stat and +5% to a growth, for +25% total at Bond 5.
  - Exceptions: Io's **Rocinan** and Alexandra's **Bucephalus** go to +30% (6 points).
  - The linear interpolation is an approximation, because each rank actually adds 5% to one specific stat. Default bond = 5, user-adjustable.
- **The mount bonus only applies while the unit is in a class whose multiplier for that mount's species is above 0.** A mount assigned to a unit in a non-mounted class gives nothing.

**Mount availability rules** (enforce as warnings, not hard blocks):
- Custom mounts can be captured and bonded only on **Cai's route** in Part I, and in Part III.
- **Io** (Rocinan, horse) and **Alexandra** (Bucephalus, pegasus) bring their own unique mounts on any route.
- Other routes in Part I have no custom mounts. Treat the mount as "none" unless the user overrides it.

**Elephant:** the elephant mount is the `Salamis War Elephant`, which is the default whenever the unit is in Elephant Rider.

**Level-gated class passives:** `class_passive_growths.txt` lists extra growths that apply from a set level while the unit is in that class. These add on top of class and mount growths.
- *Charioteer's Path* adds bonuses at Lv 35, and larger ones at Lv 45. Use the Lv 45 row in place of the Lv 35 row; the two do not stack.
- *Elephant Rider's Path* adds bonuses at Lv 45. A forum report of "+10 HP/Str/Dex/Def/Res with no mount" matches this row.
- Treat both as passives, not as mount bonuses.
- Settings toggle, default **on**. Source confidence is medium.

**Mount data:** all 20 mounts now sum to 25 at Bond 5, or 30 for the unique Rocinan and Bucephalus. This matches the +5% per bond rank rule. The build-time validator should assert this.

Two mounts have unverified English names: "Black Horse" and "Red Falicorn" are translated from the Korean community database.

### 4.3 Auto-levelling penalty for late recruits (LOW–MEDIUM confidence: tunable)

**What is known:**
- Recruits arrive auto-levelled to roughly the curve level for the chapter.
- Players widely report that late recruits' stats are **worse than those of the same character trained by the player**, and statistically behind even their own average growths.
- Example: Catania on Dietrich's route at first availability has 15 Str, 24 Spd, 21 Dex, 13 Def. A player-trained Kiroc at a similar point has 26/27/25/16. Mu is reported as especially weak as a late recruit.
- Late recruits also get poor weapon-skill gains, which matters for exam requirements.
- **The exact formula is unknown.**

**Model (all parameters in Settings, with an explanation tooltip):**

```
autoLevelGains(char, joinLevel, stat) =
    (joinLevel - baseLevel) * (personalGrowthForAutolevel(char, stat) / 100) * autoLevelEfficiency
```

- **No class modifiers and no mount bonuses** apply during auto-levelling. This is the most plausible reason auto-levelled units fall behind player-trained ones, who benefit from class bonuses.
- `autoLevelEfficiency` defaults to `0.85`. The slider runs from `0.5` to `1.0`. It represents the extra "behind average" penalty players describe.
- For Mu, `personalGrowthForAutolevel` should use her **base** growths (30/30/5/…), not the Signs of Growth values. Reports suggest her ability does not apply during auto-levelling, which explains why her late-recruit stats are especially poor. Put this behind a toggle, default on.
- **Calibration feature (Phase 2):** let the user enter a recruit's actual stats at join. The app then fits `autoLevelEfficiency` by least squares across all entered samples, and shows the fitted value.

**Why this matters for the optimizer:** each level a unit gains *after* joining is a level where class and mount bonuses apply. So recruiting earlier is strictly better for the final build. Rank "recruit on route X" options with this in mind: the same character can be much better on a route where they join early. For example, Io joins Dietrich at about Ch 3, but Cai only at about Ch 10.

---

## 5. Optimize mode: algorithm

### 5.1 Objective

The user picks an **objective profile**. Each profile is a weight vector over the 9 stats. Provide presets and a custom editor:

| Preset | Weights (HP Str Mag Spd Dex Def Res Lck Cha) |
|---|---|
| Physical attacker | 0.5 1 0 1 0.75 0.5 0.25 0.25 0 |
| Mage | 0.5 0 1 1 0.5 0.25 0.75 0.25 0 |
| Tank | 1 0.5 0 0.25 0.25 1 0.75 0.25 0 |
| Dodge tank | 0.5 0.5 0 1 0.5 0.25 0.25 0.75 0 |
| Healer/support | 0.5 0 1 0.5 0.25 0.25 1 0.5 0.5 |
| Balanced | all 1 |

Spd matters a lot for follow-ups in Fire Emblem, and Cha has a role in this game; leave the weights editable.

- **Optional auto-suggest:** a "suggest profile" button can propose a preset by matching the character's personal growths against each profile with cosine similarity.

### 5.2 Search

Expected gains are additive per level, so the problem decomposes cleanly:

- Over a range of levels, the best class to hold at each level-up is the *available* class with the highest weighted total growth at that level.
- The only coupling between levels comes from constraints: tier gates, exam timing, the fixed final class, mount continuity, and exclusivity.

Implement it as follows:

1. **Enumerate eligible classes at each level** for this character, route and Part. A class is eligible at level L when all of these hold:
   - its tier gate is met at that point in the timeline;
   - L ≥ the tier's ideal level, unless "allow early exams" is on (then L ≥ ideal − `earlyExamSlack`, default 5);
   - Advanced classes: Renown 8 is reached (map chapter → level using §3.5 and Renown → chapter using the estimates file);
   - Master and Divine classes: the level falls inside Part III. The Part III start level is a user setting, default 38;
   - route unlock rules are met (§3.3);
   - the class is not excluded by the user;
   - its data is not marked `incompleteData`.
2. **Dynamic programming over levels:**
   - State: `(level, currentClass)`.
   - Transition: stay in the class, or switch to another eligible class. A switch costs `switchPenalty` (default 0; configurable to discourage churn).
   - Score: the weighted expected gain for that level-up.
   - The final class is either fixed by the user (the "ending class") or free. When it is free, also report the best result for each possible ending class.
3. **Simplify the output:** merge consecutive levels in the same class into segments, so the result reads like "Lv 12–19 Soldier → Lv 20–34 Armored Knight → Lv 35–44 Dreadnought → Lv 45+ Castle Knight".
4. **Pick the mount:** for mounted classes, choose the best *available* mount per §4.2, or use the user's locked mount.
5. **Report:**
   - the top 3 plans;
   - the score of each;
   - the expected stat gains at the target level;
   - a per-stat comparison against a "stay in a single class" baseline.

### 5.3 Roster optimizer: "who to recruit on each route"

For each route, list every recruitable character, sorted by **projected final score**. The projection uses:
- their best plan under the chosen objective profile;
- their earliest join level on that route;
- the auto-level penalty.

Also show:
- the join chapter;
- the Support and Renown requirements, plus the extra condition;
- the flags (paralogue-gated, calendar-gated, auto-recruit).

Default targets are configurable:
- Part I end level: 37.
- Final level target: 50.

Add a "compare routes" view that shows one character across all four routes side by side. This makes it obvious which route gives the best version of each character.

**Phase 2:** a Merge Causality planner. Pick 2–4 route versions of the same character and assign a different objective profile to each. The app projects the merged per-stat maximum, and suggests complementary profiles that maximise the merged result.

---

## 6. UI requirements

The app has six views:

1. **Route selector** with tabs for Cai, Dietrich, Theodora and Leda. It shows the roster table (§5.3), with filters (auto-recruits only, recruitable by chapter N, hide gated) and sorting.
2. **Character planner**, for one character on one route:
   - Header: personal growths, join chapter and level (editable), mount selector, objective profile selector.
   - **Manual mode:**
     - A timeline editor. Add class segments with start levels, from a dropdown grouped by tier.
     - Live validation: tier ideal-level warnings, Renown/Part gates, route-exclusive unlocks, unknown skill requirements.
     - Live chart of total growth per stat per segment.
     - Projected stats at the target level.
   - **Optimize mode:** a button that fills the timeline with the top plan, with alternatives shown below it. The user can lock specific segments, or the ending class, and re-optimise around them.
3. **Class browser:** a sortable table of every class showing tier, ideal level, Renown gate, growth modifiers and mount multipliers. Toggle "show totals for character X" to add a chosen character's personal growths.
4. **Settings:** chapter→level curve, Part III start level, final level target, `autoLevelEfficiency`, bond level, early-exam slack, switch penalty, clamp bounds, Charioteer's Path toggle, Mu's Signs of Growth toggles, unlock persistence.
5. **Data issues panel:** lists every validation warning and every data-sanity flag.
6. **Persistence:** save all plans and settings to `localStorage` (allowed on GitHub Pages). Support export and import of a single JSON file, so plans can be backed up or shared. Wrap all storage calls in try/catch.

**Accessibility and polish:**
- responsive layout;
- keyboard-usable dropdowns;
- colour-blind-safe chart palette;
- dark mode that follows `prefers-color-scheme`.

---

## 7. Tech stack and repo layout

**Stack:**
- **Vite + React + TypeScript.** Charts with Recharts or Chart.js.
- **Vitest** for unit tests.
- Set `base: '/<repo-name>/'` in `vite.config.ts` so asset paths work on GitHub Pages.
- No backend. All computation runs client-side.

**Repo layout:**

```
fortunes-weave-planner/
├─ CLAUDE.md                    (this file)
├─ README.md
├─ data/
│  ├─ raw/                      (the provided data files, unchanged)
│  └─ overrides.json            (tier overrides, skill reqs, disputed values, user-added base stats)
├─ scripts/build-data.ts        (raw → src/data/*.json, plus validation)
├─ src/
│  ├─ data/                     (generated JSON, committed so the site builds without the script; regenerated in CI)
│  ├─ model/                    (pure functions: growth.ts, mounts.ts, autolevel.ts, optimizer.ts, eligibility.ts)
│  ├─ components/
│  └─ App.tsx
├─ tests/                       (Vitest; model/ must have ≥90% line coverage)
└─ .github/workflows/deploy.yml (build-data → test → build → actions/deploy-pages)
```

**Workflow:**
1. Use the official `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages` actions.
2. Enable Pages with source "GitHub Actions": run `gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow`, or tell the user which setting to click if the API call fails.
3. After the first deploy, print the Pages URL.

**Required test cases (minimum):**
- **Total growth:** Leda (Spd 65) in a class with Spd +25 equals 90.
- **Clamping:** a total below 0 clamps to 0, and a total above 100 clamps to 100.
- **Mount bonus:**
  - A Ferghanan Horse (Str +5) on Light Cavalry (Horse 1.0) adds +5 Str at Bond 5 and +2 at Bond 2.
  - On Charioteer (Horse 2.0) it adds +10 at Bond 5.
  - On a non-mounted class it adds 0.
- **Auto-level:** with efficiency 1.0 and no class bonus, the gains equal `levels × growth`. With efficiency 0.85, they are 85% of that.
- **Mu:** auto-level uses her base 30% Str. Post-join levels use 50% when the toggle is on.
- **Optimizer (synthetic data):** given a 3-class toy dataset, the DP returns the known optimal segmentation and respects a locked ending class.
- **Eligibility:** an Advanced class is not eligible before Renown 8 or below level 35 − slack. A Master class is not eligible in Part I.

---

## 8. Known unknowns: surface them, never hide them

Mark all of these clearly in the UI (an info icon with a tooltip), and list them in the README:

1. The auto-level formula (§4.3). Its default is a guess. Calibrate it from user data.
2. Whether recruits join at a fixed level for the chapter, or scale to the army.
3. Base stats for recruitable characters. Only the 18 story characters in `base_stats.txt` have fixed bases.
4. Stat caps and the level cap. Players report reaching Lv 99 with exploits, so cap the timeline at 99 but default the target to 50.
5. Some class skill requirements, especially Specialty-tier classes.
6. Class growth values where sources disagree. `DATA_NOTES.md` lists these, mostly Spd/Dex swaps on a few classes. Show a ⚠ badge on those classes.
7. Exactly when a route-exclusive class becomes available on other routes. Game8 says classes unlocked on one path can be learned on other paths once obtained.
8. Whether Charioteer's mount doubling (multiplier 2.0) and Charioteer's Path stack exactly as modelled. The KR community DB lists both.
9. When Part II and Part III levels occur. They are user-configurable.

When you are unsure about a mechanic, **make it a setting with a sensible default and a tooltip.** Do not hard-code it. Do not invent data. If something is needed and missing, add a `TODO(data)` stub in `overrides.json` and show it in the Data issues panel.

---

## 9. Working style for this repo

- **Keep model code pure.** `src/model/` contains pure, framework-free TypeScript. Its only inputs are the JSON data plus settings, so it stays testable.
- **Build in phases, commit in small steps:**
  1. data pipeline and validation;
  2. model and tests;
  3. manual planner UI;
  4. optimizer;
  5. roster and compare views;
  6. deploy;
  7. Phase 2 features (calibration, Merge Causality planner).
- **Pause for review:** after step 2, show the user sample outputs for 2–3 characters, such as Io on all four routes, before building the UI.
- **Keep the README current:** it explains the math in plain language, so the user can sanity-check results against their own save.
