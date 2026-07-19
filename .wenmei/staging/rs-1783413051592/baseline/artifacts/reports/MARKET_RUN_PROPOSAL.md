# Market Run — Educational Game Proposal

**Status:** Concept phase — slides designed, components pending  
**Last updated:** 2026-06-14

---

## Concept

A **Sim Board Game** set inside a mini-market. Players physically operate the store for one workshop session (90 min). Customers arrive as cards with hidden behavior profiles. Players observe touch points, log data, and ultimately build an RFM model — not from a spreadsheet, but from living through the process.

**Format:** Between a board game and an RPG  
**Players:** 2–5 (workshop classroom)  
**Session length:** 90 minutes  
**Primary teaching goal:** Customer Journey + RFM model (Recency, Frequency, Monetary)

---

## The Core Idea

> The game is the classroom. The data is the lesson.

Students don't analyze a case study about customer journey — they **generate** one. Every customer card that walks through the store door is a data point. By the end of the session, players have built their own RFM segments from scratch, using data they collected themselves.

---

## Game Format

### Why Board Game × RPG?

- **Board game** gives it structure: defined rounds, rules, win conditions, components players can hold
- **RPG** gives it role immersion: players become characters with different information asymmetry and objectives

### Player Roles (choose one per session)
| Role | Sees | Wins by |
|------|------|---------|
| **Store Owner** | Full store flow, inventory | Maximizing revenue per round |
| **Data Analyst** | Customer data sheet, trends | Accurate RFM segmentation |
| **Marketer** | Segments, campaign options | Correct targeting actions |

In small groups (2–3 players), roles can be combined.

---

## The Game Loop — One Round

```
[01] FLIP      →  [02] WALK      →  [03] LOG       →  [04] SCORE     →  [05] DECIDE
Draw a customer   Simulate touch    Record data on    Calculate R·F·M   Take a targeted
card from deck    points through    your player       for this          marketing action
                  the market        data sheet        customer
```

**Step 04 (Score)** is the learning engine — players manually calculate Recency, Frequency, and Monetary value for each customer. The model isn't explained upfront; it emerges from the data.

---

## Touch Points (Data Collection)

Each customer visit passes through up to 4 touch points. Players track whichever ones their role grants access to.

| Touch Point | RFM Dimension | Data Captured |
|-------------|---------------|---------------|
| **Entry** | Recency | When did they arrive? First visit or return? Which channel? |
| **Browse** | Frequency | What did they look at? How long? Which category? |
| **Purchase** | Monetary | What did they buy? Basket size? Total spend? |
| **Return** | Loyalty | Did they come back? How soon? What triggered it? |

---

## RFM Model Integration

Customer cards have **hidden RFM profiles** revealed progressively:
- Round 1: only Entry data visible
- Round 2: Browse data unlocks
- Round 3+: Purchase and Return data emerges

By round 4, players have enough data to score and segment. Final phase: players make marketing decisions based on their segments and score points based on accuracy.

### RFM Scoring Sheet (per customer)
```
Recency  (R): Days since last visit  →  Score 1–5
Frequency (F): Number of visits      →  Score 1–5
Monetary  (M): Total spend           →  Score 1–5

Segment:
  R≥4, F≥4, M≥4  → Champions
  R≥3, F≥3       → Loyal Customers
  R≥4, F=1       → New Customers
  R=1, F≥3       → At Risk
  R=1, F=1       → Lost
```

---

## Components Needed (to design next)

- [ ] **Customer Card** — front: character + visible touch point data / back: hidden RFM profile revealed end of round
- [ ] **Player Data Sheet** — per-player log for recording touch points each round
- [ ] **Role Card** — outlines player's information access, objective, and scoring rules
- [ ] **Market Board** — the store layout showing 4 touch point zones (Entry → Browse → Purchase → Return)
- [ ] **Action Cards** — marketing actions players can take (discount, loyalty email, win-back campaign, etc.)
- [ ] **Round Tracker** — 4–6 rounds per session
- [ ] **Facilitator Guide** — debrief questions, RFM reveal script, real-world bridge

---

## Workshop Integration

Market Run is designed to slot into:
- Customer Journey workshops
- CRM / retention strategy sessions
- Marketing Analytics courses
- Data literacy programs

**Recommended flow:**
1. Brief rules intro (10 min)
2. Play 4 rounds (50 min)
3. Score + segment customers (15 min)
4. Debrief: connect game data to real-world RFM tools (15 min)

---

## Learning Outcomes

By the end of the session, players will have:

1. Hands-on intuition for what a touch point actually is
2. Experience building an RFM model from raw game data
3. Understanding of customer segmentation in practice
4. Vocabulary for customer journey strategy discussions
5. A data-first mindset — earned through gameplay, not lecture

---

## Slides Designed (Pencil canvas)

File: `game-canvas.pen`

| Slide | Node ID | Status |
|-------|---------|--------|
| S1 — Cover | `FJRfZ` | ✅ Done |
| S2 — Premise | `vx3Lp` | ✅ Done |
| S3 — Game Format | `W5Lyl3` | ✅ Done |
| S4 — Game Loop | `jG5X0` | ✅ Done |
| S5 — Touch Points | `QkKZx` | ✅ Done |
| S6 — Closing | `qo6GG` | ✅ Done |

---

## Open Questions

- [ ] Is the target audience students, corporate trainees, or both?
- [ ] Should RFM be the only model, or should players choose (RFM vs CLV vs cohort)?
- [ ] Physical game vs digital simulation vs hybrid?
- [ ] Number of unique customer cards needed (suggest 20–30 for replayability)
- [ ] Should facilitators be able to script specific customer behaviors for targeted lessons?
