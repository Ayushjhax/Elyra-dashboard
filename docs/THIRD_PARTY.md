# Third-party assets

## Fonts

### General Sans (Indian Type Foundry, via Fontshare)

- **Used in:** the website (`app/fonts/GeneralSans-Variable.woff2`) and the
  Android app (`mobile/assets/fonts/GeneralSans-{Regular,Medium,Semibold}.otf`).
- **Licence:** ITF Free Font License (FFL) 2.0, 17 Aug 2026. The full text
  ships in Fontshare's download as `License/FFL.txt`.
- **Permitted:**
  - personal and commercial use, free of charge;
  - self-hosting for our own website;
  - embedding in our own mobile and desktop applications (§01);
  - attribution is optional.
- **Conditions we keep:**
  - **Unmodified files.** No subsetting, format conversion or renaming
    (§02, §05). The app uses Fontshare's static OTFs exactly as downloaded.
  - **No redistribution of the files themselves.** They may not be made
    available through "publicly accessible servers" or a repository others
    can download from (§02). This repository must stay private, or the font
    files must be kept out of it — for example, fetched at build time from a
    private store.

### Fustat (Google Fonts)

- **Used in:** the website (`app/fonts/Fustat-Latin-Variable.woff2`) and the
  Android app, through `@expo-google-fonts/fustat` (static weights 400–700).
- **Licence:** SIL Open Font License 1.1, which permits embedding and
  redistribution.

### DM Serif Display (Google Fonts)

- **Used in:** the Android app's sign-in screen only
  (`mobile/assets/fonts/DMSerifDisplay-Regular.ttf`), for the headline and the
  footer line.
- **Source:** `google/fonts`, `ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf`,
  unmodified (SHA-256 `8cc36435…ab616`).
- **Licence:** SIL Open Font License 1.1, which permits embedding and
  redistribution. Copyright 2014–2018 Adobe, 2019 Google LLC.

## Images

- **The Elyra mark** (`public/elyra-public-avatar.png`, copied to
  `mobile/assets/images/elyra-mark.png`) is Elyra's own.
- **The gold emblem** on the app's sign-in screen
  (`mobile/assets/images/elyra-emblem.png`) is Elyra's own: the original
  render with its background made transparent.
- **The Google "G"** on the sign-in button (`mobile/assets/images/google-g.png`)
  is Google's mark, used unaltered as its sign-in branding guidelines require.
- **Asset and company logos** are loaded at runtime from their sources and
  never bundled:
  - asset logos: the CoinMarketCap URLs Pyth publishes, and Hyperliquid's
    coin icons;
  - company logos: Parqet and Financial Modeling Prep.
