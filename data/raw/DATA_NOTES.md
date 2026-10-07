# Data notes: sources, corrections and disputes

Fortune's Weave cannot be data-mined (Switch 2), so all values here come from community transcription of in-game screens. Sources were cross-checked as of 7 Oct 2026.

**Sources:**
- **SF**: Serenes Forest growth tables, taken from the in-game tooltips.
- **G8**: Game8 per-class pages.
- **KG**: KeenGamer growth-rate guide.
- **FX**: Fextralife wiki.
- **KR**: the Korean community DB (github.com/cass07/fe18-db).
- **Fandom** and **FEWiki**: the two Fire Emblem wikis.

## class_growths.txt

**Added two missing Advanced classes.** Their values agree across G8, KR and turam.dev:

| Class | HP | Str | Mag | Spd | Dex | Def | Res | Lck | Cha | Mount |
|---|---|---|---|---|---|---|---|---|---|---|
| Dancer | 15 | 5 | 0 | 25 | 10 | 0 | 5 | 10 | 20 | none |
| Cataphract | 15 | 15 | -5 | -10 | 0 | 10 | -5 | 0 | 5 | Horse |

**Corrected values.** Each correction is the majority value across the sources:

| Class | Was | Now | Sources for new value | Sources for old value |
|---|---|---|---|---|
| Archer | Str 5 | Str 0 | SF, KR | KG |
| Battlemaster | Spd 5 / Dex -5 | Spd -5 / Dex 5 | G8, KG, KR | SF |
| Shadow Seeker | Spd 25 / Dex 15 | Spd 15 / Dex 25 | G8, FX, KG, KR | SF |
| Druid | Spd 10 / Dex 15 / Lck 0 / Cha 10 | Spd 15 / Dex 10 / Lck 10 / Cha 0 | G8, KG, KR (SF agrees on Lck/Cha) | — |
| Wiseman | Spd 5 / Dex 0 | Spd 0 / Dex 5 | G8, KG, KR | SF |

**Kept, but disputed.** Flag these in the app:

| Class | Kept | Other reading |
|---|---|---|
| Caladrius | Spd 5 / Dex 10 (FX) | Spd 10 / Dex 5 (SF, KR) — 2 vs 2 |
| Orichaldia | Spd 5 / Dex 0 (SF) | Spd 0 / Dex 5 (FX, KR) — 2 vs 2 |
| Dragoon | Spd 0 / Dex 5 (G8, KG) | Spd 5 / Dex 0 (SF, KR) |
| Troubadour | Spd 5 / Dex 0 (G8, KG) | Spd 0 / Dex 5 (SF, KR) |
| Archer | Dex 15 (SF, KR) | Dex 10 (G8, KG) |

**Mount-type corrections.** These are the columns saying which mount species a class can use:
- Forest Knight → Horse. It was "none". Source: KR, and G8's mount recommendations.
- Valkyrium → Horse. It was Pegasus. Source: KR, and G8 lists it with the Monoceros horse.
- Celestial Trooper → Pegasus. It was "none". Source: KR, and G8 pairs it with Falicorn.
- Dragoon → Bau. It was Wyvern. Source: KR, and G8 pairs it with Black Bau. No Wyvern or Griffon mounts exist in any source.
- Orichaldia is kept as Ornius. KR says Horse, but G8's horse recommendations don't list it. **Disputed.**

**Other changes:**
- Elephant Rider's `Renown_Req` is now `Part 3`. G8 says it unlocks for all routes in Part 3 with an Elephant Licence.

## mount_growths.txt

Rebuilt from KR. This adds 4 mounts, Red Bau, Black Bau, Black Horse and Red Falicorn, and replaces the Elephant row. Every mount now sums to +25 at Bond 5, or +30 for the unique Rocinan and Bucephalus. That matches the "+5% growth per bond rank" rule reported on Serenes Forest and KeenGamer.

| Mount | Old file | Now |
|---|---|---|
| White Ornius | all 0 | Spd 5, Dex 5, Res 15 |
| Wild Pegasus | all 0 | Spd 15, Res 10 |
| Meganius | HP 5 / Str 5 / Dex 5 / Def 15 (=30) | Str 5 / Dex 5 / Def 15 (=25) |
| Rocinan | Def 5 (=25) | Def 10 (=30, unique mount) |
| Elephant | "Standard/Default" 10/10/0/0/15/10/10 | Salamis War Elephant 5/5/0/0/5/5/0/5/0. The old row looked like the Elephant Rider's Path passive mixed in; that passive now lives in `class_passive_growths.txt` |

The English names "Black Horse" and "Red Falicorn" are my translations of the KR names, and are unverified.

## class_passive_growths.txt (new)

Source: KR's cavalry table. It matches a Serenes Forest forum report of Elephant Riders showing about +10 HP/Str/Dex/Def/Res with no mount.
- Charioteer's Path, Lv 35: HP 10, Str 5, Mag 5, Spd 5, Dex 5, Def 5.
- Charioteer's Path, Lv 45: HP 10, Str 15, Mag 5, Spd 5, Dex 10, Def 15, Lck 5.
- Elephant Rider's Path, Lv 45: HP 10, Str 10, Dex 10, Def 10, Res 10.

## char_growths.txt

Unchanged; it matches Serenes Forest exactly. Two characters are disputed:
- **Nezha Str**: 45 (SF) vs 55 (KR).
- **Yang Jie Str**: 30 (SF) vs 35 (KR, FX).

Mu's row holds her Signs of Growth values. Her base growths are 30/30/5/30/30/20/10/10/20 (FX, KG).

## base_stats.txt (new)

Fixed base stats for 18 story characters, from Fandom. Buccar's row is also confirmed by FEWiki. The values were re-ordered from Fandom's `HP Str Mag Dex Spd Lck Def Res Cha` column order.

Some of these characters start above Level 1, which confirms their join levels:
- Ultand: Lv 13 (Diviner).
- Mikaela: Lv 5 (Gladiator).
- Lysander: Lv 5 (Ornius Rider).
- Lilian: Lv 5 (Hunter).
- Olympia: Lv 5 (Diviner).

Ultand at Lv 13 in Ch 6 and Mikaela at Lv 5 in Ch 4 both sit on the chapter→level curve.

**Not available anywhere:** base stats for recruitable characters such as Io, Catania and Kiroc. Their pages on both wikis are empty, because they are auto-levelled to whenever you recruit them.
