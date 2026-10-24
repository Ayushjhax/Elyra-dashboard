# Release notes template

For the Publisher Portal's **What's New** (people read it on the app's store
page) and the matching `CHANGELOG.md` entry. Copy the block below, fill it
in, delete what doesn't apply.

Voice (docs/ELYRA_BRAND.md): plain, specific, calm. Say what changed for the
person, not how it was built. Sentence case. No hype, no exclamation marks,
no promises about returns or prices. Never imply endorsement by Solana
Mobile, a venue or a data provider. No mention of Telegram — the app has
none.

Keep What's New short: the store shows the first few lines, so lead with the
change that matters most.

---

```text
Elyra <version>

New
- <What someone can now do, in one line. E.g. "Set price alerts from any market's screen.">

Improved
- <What works better. E.g. "Portfolio loads faster on a slow connection.">

Fixed
- <What was wrong, as the person saw it. E.g. "Large deposits no longer show as $53,084,444.6.">

<Only if it applies:>
You'll need this version to keep using Elyra after <date>.
```

---

## Checklist before pasting it

- [ ] Every line is true of this build (checked on the QA run).
- [ ] Nothing names a feature that is turned off in production.
- [ ] Amounts and examples contain no real address or balance.
- [ ] If `minSupportedVersion` will be raised for this version, the last
      line says so and gives the date.
- [ ] The same changes are in `CHANGELOG.md` under this version.
