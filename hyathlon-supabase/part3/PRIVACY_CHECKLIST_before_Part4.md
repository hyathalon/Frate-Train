# Before storing athlete health information (Part 4)

Part 4 adds personal rehab plans that only the athlete can see. There is no practitioner access and nothing is sent to anyone. It still stores **health information** (injury plan, optional pain scores, rehab logs), so the basics below apply.
Under the Australian Privacy Act, businesses providing health services are covered **regardless of turnover**, and the
small-business exemption is expected to be removed under the 2026–27 reforms. Treat Hyathlon as covered.

This is a checklist, not legal advice. Get it confirmed by a privacy lawyer before launch.

## Decisions already made in the design
- [x] No third parties: no practitioner accounts, no emails, no sharing.
- [x] Row-level security: each athlete sees and edits only their own plans and logs. Coaches get no access.
- [x] Pain scores are optional.
- [x] Rehab frameworks stay hidden until a coach marks them Approved (after physio review).

## To do before running Part 4
- [x] **Data location.** The Supabase project is in Sydney (ap-southeast-2), so health data stays in Australia (APP 8, cross-border disclosure).
- [ ] **Privacy policy** covering health information: what is collected, why, who can see it, how long it's kept, how to access or delete it.
- [ ] **Explicit consent** screen before an athlete logs injury or pain data, separate from general terms.
- [ ] **Data minimisation.** Only collect what is needed. Pain scores and notes are optional fields.
- [ ] **Retention and deletion.** Let athletes delete their rehab data and account; set how long inactive data is kept.
- [ ] **Security.** MFA for coach and practitioner accounts; keep the secret key (`sb_secret_…`) out of the app and repo; enable Supabase backups and point-in-time recovery.
- [ ] **Data breach plan** for the Notifiable Data Breaches scheme (who assesses, who notifies the OAIC and athletes).
- [ ] **Legal review** of the above, and of the "considerations, not medical advice" wording.

Sources: OAIC, Small business: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business
