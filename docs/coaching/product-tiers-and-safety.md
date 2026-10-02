# Product Tiers, Safety and Escalation

**Purpose:** How the app stays as hands-off as possible while staying safe, after the outsider reviews (Grok, ChatGPT, Oct 2026). Sold as **Hyathlon**; running-race goals are available inside the app so athletes can keep training with us for a running event.

**Not legal advice.** Tiers and health-data handling need an Australian legal review before launch (terms, consent, health information under the Privacy Act).

---

## 1. Tiers (confirmed by coach, Oct 2026)

| | **App, weekly** | **App, 12 weeks** | **Run only coaching** | **Run + strength coaching** |
|---|---|---|---|---|
| Price | $24.95 a week | $239 up front | $150 a month | $250 a month |
| Programming | AI | AI | AI run plan, coach can edit sessions | AI hybrid plan, coach can edit sessions |
| Strength | Yes (AI) | Yes (AI) | **No** | Yes |
| Initial consultation (30 min set-up call) | — | — | Yes | Yes |
| Weekly check-in | AI chat | AI chat | AI chat + written coach review of flags and the week | AI chat + written coach review of flags and the week |
| Flag review by a coach | — | — | Yes | Yes |
| Re-plans | 1 re-plan per 4 weeks of paid time (first one unlocks after 4 paid weeks); unused don't carry over; then $10 each | 3 in the block; then $10 each | Unlimited | Unlimited |
| Coach reply time (shown to athletes) | 24–48 h (credit replies) | 24–48 h (credit replies) | 24–48 h | 24–48 h (internal target 24 h) |
| Health features (body reports, injury, return to run, cycle) | Not collected | Not collected | Yes, with consent | Yes, with consent |
| Athletes per coach | — | — | about 15 | 8–10 (about 25–30 min each a week) |
| Human at sign-up | None | None | Consultation | Consultation |

**Billing**
- **Billing week vs program week:** billing runs from the sign-up day (e.g. Wed–Tue). The program fills the first days up to Sunday with an easy lead-in, then programming weeks run Mon–Sun.
- **App, weekly:** cancel any time; they pay to the end of the week they're in. One reminder before each charge: pause the programming, or it renews. A pause stops new plans and doesn't refund the current week.
- **App, 12 weeks:** paid up front, no pause, no refund.
- **Coaching:** monthly. Run only and run + strength include the same coaching; run + strength pays for the strength programming.

**Coach credits (all tiers)**, 1 credit = $30:
- Written coach reply: 1 credit ($30)
- Short video reply: 2 credits ($60)
- Online Q&A call: 4 credits ($120), **maximum 10 minutes**. Calls aren't included in either coaching tier.

**Initial consultation** (both coaching tiers): a 30-minute set-up call, not an open hour. Covers goal, days, equipment, race date and the red rules. Anything clinical waits for the athlete's own clinician.

**Coaches:** new members are shared across coaches. Reply times are shown to athletes as "within 24–48 hours".

## 2. Health data and pain in the automated tier
The automated tier **doesn't store symptoms or pain scores.** Instead the weekly check-in asks how the athlete wants the week, as a training choice:
- *Train as planned · Go a bit easier · Avoid running this week (off-feet) · Rest*
- The app adjusts the week to the choice. It doesn't ask why.
- If the athlete mentions pain or injury in the chat, the AI doesn't assess it. It says: stop the session if anything hurts, see a medical professional, and use "avoid running" or "rest" until cleared. It offers a coach credit or Online Coaching for guided return.
- Sessions carry a standing line: *"Stop if you feel pain and check with a medical professional."*
- **Pre-exercise screening at sign-up** (Australia's adult pre-exercise screening, APSS). If it says to get medical clearance, the athlete confirms they've been cleared before the program starts. *Legal review: whether storing the screening answer counts as health information.*

## 2b. Return to running (Online Coaching, or a coach credit)
- When an athlete reports pain or an injury, the app can **generate an automated return-to-run program** from the templates in `07` (walk–run stages, bridge, off-feet sessions to keep fitness).
- A coach **reviews it against the athlete's own medical advice** before it's released, and adjusts if needed. The athlete adds what their medical professional said (restrictions, timeline).
- Progression through the stages follows the athlete's reports; going back a stage if symptoms return. Any worsening goes back to the coach.
- Automated tier: no return-to-run program without a coach (it would need health data). The athlete can use a coach credit to get one.

## 3. Rule order (when rules conflict, the higher one wins)
1. **Safety:** screening, stop-on-pain, red choices, medical escalation.
2. **Structure:** race dates, A/B/C priority, taper, race recovery, availability.
3. **Coaching:** phase, session types, quality and key sessions, progression, strength placement and interference.
4. **Personalisation:** preferences, repeats, variety, equipment, favourite sessions.
5. **Presentation:** wording, motivation, tone.

## 4. Athlete choices: green, amber, red
- **Green: change freely.** Move, swap or skip a session; equipment; time; variety.
- **Amber: see what it changes, then decide.** Moving an interval session onto the day before or after another interval session (one-tap "Make it an aerobic run"); Strength on a recovery day; extra strength sessions; race sims more often than every 3–4 weeks; adding a session on top.
- **Red: the app won't program it automatically.**
  - A full race simulation in the taper or race week.
  - Hard training inside the 48–72 h after a race.
  - A beginner choosing weekly full simulations.
  - Online Coaching: the coach is notified and decides.
  - Automated tier: the athlete sees a short explanation and keeps the safe plan. They can still do their own session, and it counts in load.

## 5. Flags (what reaches a coach)
Both coaching tiers, or when an athlete uses a coach credit. Each flag has a **safe default** that applies until the coach replies.

| Flag | Safe default until the coach replies |
|---|---|
| Pain, or a body report 4/10+, or a new or worsening symptom | Affected sessions off-feet or rest |
| A red choice | Keep the safe plan |
| Generator still failing after repair | Serve a template week |
| RPE well above target 2+ weeks in a row | Lower end of ranges |
| 2+ key sessions missed in a row | Keep the next key session; no stacking |
| Regularly overriding the plan (e.g. easy days run hard) | Note to the athlete |
| A question the AI can't answer | "A coach will get back to you" (credit or included) |

## 6. Coach programming: coach editor in the app (DECIDED)
- **Decision:** coaches program directly in the app with a coach editor, rather than importing from Final Surge.
- Background on Final Surge:
- Final Surge has no public API. It pushes planned workouts to partners (e.g. Zwift, Garmin) through partner integrations, and offers a calendar sync URL (iCal).
- Options: (1) test importing an athlete's Final Surge calendar feed (cheap; depends on how much workout detail the feed carries); (2) ask Final Surge about a partner integration; (3) longer term, a coach editor inside the app so coaches don't need a second tool.
- Note: sessions written in Final Surge sit outside the app's adaptation, so they'd be treated like "I have my own run plan" (fixed sessions the app plans around).

## 7. Open questions for the coach

## 8. To do once tiers are confirmed
- Draft the **app agreement** (from the current Frate Train coaching agreement), with a section per sign-up level, for legal review.
