# Closed testing kit (the 12-testers / 14-days gate)

New **personal** Google Play developer accounts must run a **closed test** with **at least
12 testers who stay opted in for 14 continuous days** before you can apply for production
access. This is the single slowest step — start it as soon as the first build is up.

The 14-day clock only counts while you have ≥12 testers opted in, so recruit a few extra
(aim for ~15) in case someone drops off.

## Order of operations

1. **Internal testing first (optional but recommended)** — upload the AAB to the *Internal
   testing* track, add yourself, install, and run the smoke test below. Internal testing is
   instant and does **not** count toward the 14 days; it's just to catch a broken build before
   you put it in front of real testers.
2. **Create the closed track** — Play Console → *Testing → Closed testing → Create track*
   (or use the default "Alpha" track). Create a release, attach the AAB (or promote it from
   internal).
3. **Add testers** — the reliable way is a **Google Group**:
   - Create a group (e.g. `expense-manager-testers@googlegroups.com`) at groups.google.com.
   - Add your testers' Google-account emails to the group.
   - In the closed track's *Testers* tab, add the group's email address.
   - Add the group to testers, save, and copy the **opt-in (web) URL** Play gives you.
4. **Send the opt-in link** — testers must (a) join via the opt-in URL, then (b) install from
   Play. Use the message below.
5. **Keep ≥12 opted in for 14 days**, then **apply for production access** (Console prompts you
   once you're eligible).

## Smoke test before handing the build to testers

- [ ] App installs and launches from the Play test link (not sideloaded).
- [ ] First-run: set a PIN, relaunch, confirm it locks and the PIN unlocks it.
- [ ] Wrong PIN a few times → lockout countdown appears and blocks entry; correct PIN clears it.
- [ ] Add an expense and an income entry; both show in the ledger with correct sign/colour.
- [ ] Switch currency; amounts round correctly.
- [ ] Export CSV, then import it back — entries round-trip without duplication or corruption.
- [ ] Backup, wipe-and-start-over, restore — data comes back intact.
- [ ] Toggle light/dark theme.
- [ ] Biometric unlock (if the test device supports it).

## Tester recruitment message (copy/paste)

> **Subject: Help me test my app on Google Play (2 mins to set up)**
>
> Hi! I've built a small Android app — **Kept**, a private expense tracker that
> keeps all your data on your own phone (no account, no cloud, no ads). Google requires 12
> testers before I can publish it publicly, and I'd really appreciate your help.
>
> It's a two-step setup, then you can ignore it:
> 1. Tap this link on your Android phone and tap **"Become a tester"**: **[OPT-IN URL HERE]**
> 2. Then install "Kept" from the Play Store link on that same page.
>
> That's it — you don't have to actively test anything. Just please **keep it installed for
> ~2 weeks** (that's the part Google checks). Feedback is a bonus, not required.
>
> One catch from Google's side: send me the **email address of the Google account** you use on
> your phone, so I can add you to the tester list before the link will work for you.
>
> Thank you! 🙏

## In-app / short version (for a WhatsApp or SMS)

> Testing my new Android app & need 12 testers for Google's rules. 2-min setup, keep it
> installed ~2 weeks, no active testing needed. Send me your phone's Google email and I'll
> add you, then I'll share the install link. 🙏

## Notes

- Testers **must** use the Google account that's signed in on their phone — a mismatch is the
  #1 reason "the link doesn't work."
- iOS users can't help here (this is Android/Play-specific).
- You can track opt-in count in the closed track's dashboard; keep it ≥12 for the full window.
