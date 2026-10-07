# Fortune's Weave Planner

A static web app for planning character builds in **Fire Emblem: Fortune's Weave** (Nintendo Switch 2, Sep 2026).

Hosted on GitHub Pages: after the first deploy, the URL will be `https://<your-github-username>.github.io/fortunes-weave-planner/`

---

## What it does

Answers two questions:

1. **Who should I recruit on each of the four Part I routes** (Cai, Dietrich, Theodora, Leda)?
2. **For each character, which class sequence maximises their stats** by the end of the game?

Two modes:

- **Manual mode** — pick classes and level ranges; the app projects expected stats with ±1σ variance bands.
- **Optimize mode** — DP finds the class sequence that maximises a weighted stat objective, subject to tier gates, Renown requirements, and route unlock rules.

---

## How to use

### Running locally

```
npm install
npm run build-data   # parse raw data → src/data/*.json
npm test             # run unit tests (46 tests)
npm run dev          # start the Vite dev server
```

### Building for production

```
npm run build        # build-data → tsc → vite build → dist/
```

### Deploying

Push to `main` — GitHub Actions runs build-data, tests, and deploys to Pages automatically.

---

## The math

### Growth rates

On each level-up, every stat rolls independently. The chance of gaining +1 is the **total growth**:

```
total_growth = personal + class_modifier + mount_bonus + passive_bonus
```

All values are clamped to [0, 100]%.

Expected gain over N levels at total growth g%:

```
expected = N × (g / 100)
std_dev  = √(N × p × (1 − p))   where p = g / 100
```

### Mount bonus

```
mount_growth[stat] = mount.growth_at_bond5[stat]
                   × class.mount_multiplier[mount.species]
                   × (bond / max_bond)
```

- Normal mounts: max_bond = 5. Unique mounts (Rocinan, Bucephalus): max_bond = 6.
- Charioteer doubles horse mount growths (multiplier 2.0).
- No bonus when the class's multiplier for that species is 0.

### Auto-levelling penalty (§4.3 — LOW confidence)

Late recruits arrive at an auto-levelled stat that is worse than if you trained them yourself. The model:

```
auto_level_gains = (join_level − base_level) × (personal_growth / 100) × auto_level_efficiency
```

- No class or mount bonuses during auto-levelling.
- `auto_level_efficiency` defaults to 0.85. Adjustable in Settings.
- For Mu, auto-levelling uses her base growths (30/30/5/…), not the Signs of Growth values.

### Optimizer

Dynamic programming over `(level, class)` states:

1. Enumerate eligible classes at each level (tier gate, Renown, route unlock, Part III restriction).
2. Score each `(level, class)` state as the weighted expected growth gain for that level-up.
3. Backtrack to reconstruct the optimal class sequence.
4. Merge consecutive same-class levels into readable segments.

---

## Data sources

| File | Source |
|---|---|
| `char_growths.txt` | In-game growth rate screen |
| `class_growths.txt` | Korean community database + player testing |
| `class_passive_growths.txt` | Korean community database; medium confidence |
| `mount_growths.txt` | Korean community database + player reports |
| `base_stats.txt` | Fandom Fire Emblem Wiki (column order corrected) |
| `recruitment_table.md` | RPG Site, Game8, GamesHedge, Raider King; cross-checked |
| `recruitment_join_estimates.md` | Neoseeker walkthroughs + Game8 + one confirmed save point |

See `data/raw/DATA_NOTES.md` for full attribution and disputed values.

---

## Known unknowns

These are surfaced in the app's Data Issues panel and Settings tooltips:

1. **Auto-level formula** — the default efficiency (0.85) is a guess calibrated against player reports. A calibration tool (Phase 2) lets you fit it from your own save.
2. **Fixed vs. scaling join level** — whether recruits join at a fixed level per chapter or scale to the army level is unconfirmed.
3. **Base stats for recruitable characters** — only the 18 story characters have confirmed base stats. Others show "gains since base" instead of absolute stats.
4. **Stat and level caps** — the timeline is capped at 99; the default target is 50.
5. **Some class skill requirements** — especially Specialty-tier classes. Shown with a ⚠ badge.
6. **Disputed class growths** — a few classes have Spd/Dex swaps between sources. Shown with a ⚠ badge. See `DATA_NOTES.md`.
7. **Route-exclusive class availability on other routes** — Game8 says once obtained, a class is save-wide. Default on; toggle in Settings.
8. **Charioteer's Path + mount doubling stacking** — both are from the KR community DB; stacking behaviour assumed.
9. **Part II and Part III start levels** — user-configurable.

---

## Repo layout

```
fortunes-weave-planner/
├─ CLAUDE.md                    project spec
├─ README.md
├─ data/
│  ├─ raw/                      unchanged source files
│  └─ overrides.json            tier overrides, disputed values, user base stats
├─ scripts/build-data.ts        raw → src/data/*.json + validation
├─ src/
│  ├─ data/                     generated JSON (committed; regenerated in CI)
│  ├─ model/                    pure TypeScript: growth, mounts, autolevel, eligibility, optimizer
│  ├─ components/               (Phase 3)
│  └─ App.tsx
├─ tests/model.test.ts          46 unit tests; all model functions covered
└─ .github/workflows/deploy.yml build-data → test → build → Pages
```

---

## Phases

- **Phase 1 ✓** — data pipeline, model layer, unit tests
- **Phase 2** — full six-view UI (route selector, character planner, class browser, settings, data issues)
- **Phase 3** — optimizer UI, roster comparison, Merge Causality planner, calibration tool
