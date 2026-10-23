# Elyra privacy policy

> **DRAFT — not legal advice.** Written from what the code in this
> repository actually collects and sends, as of 24 October 2026. Every
> **[LAWYER]** marker is a point a qualified lawyer must settle before
> publishing at https://getelyra.xyz/privacy. Every **[OPERATOR]** marker is
> a fact only the operator can supply or must confirm.

**Last updated:** [OPERATOR: date of publication]

This policy covers Elyra: the website at getelyra.xyz, the Android app
"Elyra" (`xyz.getelyra.app`), and the API both use (api.getelyra.xyz). The
website and the app share one account, so this one policy applies to both.

## Who we are

Elyra is operated by **[OPERATOR: legal name of the person or company,
registered address, country]**. Write to us at ayushkmrjha@gmail.com.

**[LAWYER]** Name the data controller, and decide whether an EU/UK
representative (GDPR Art. 27) or a data protection officer is required.

## The short version

- You sign in with Privy (email, Google, a passkey or a Solana wallet).
  Elyra never sees or stores a wallet's private key.
- We store what you create in Elyra: alerts, conversations, reports,
  watchlists, connections, preferences. It's kept until you delete it or
  delete your account.
- To answer you, we send data to the services listed below: an AI model
  for questions, price and blockchain providers for your wallet, and the
  venues you connect.
- We don't sell your data, don't show ads, and don't use analytics or
  tracking tools in the app or on the website.
- You can delete your account in the app (Account → Settings → Delete
  account). That deletes it on the website too.

## What we collect

### Your account

| Data | Where it comes from | Why |
|---|---|---|
| A Privy user ID | Privy, when you sign in | To know which account a request is for |
| Your sign-in method and linked logins: email address, Google account, passkey, wallet addresses | Privy | To show you how you signed in, and to sign you in |
| Your Solana address and, if you have one, an Ethereum address | Privy | To read your wallet and your Hyperliquid account |
| When the account was created | Our database | To show it on your account page |
| A referral code, and who referred you | A referral link you opened | To credit the person who invited you |

If you sign in with Privy's embedded wallet, Privy creates and secures it.
Its key is never sent to Elyra. See Privy's privacy policy for what Privy
itself keeps.

### What you create in Elyra

- **Questions to Ask Elyra and its answers**, kept as conversations. Includes
  anything you attach (images, PDFs, text files). We store the conversation
  text; **attachments are sent to the model with your question and are not
  stored by us.**
- **Memory**: standing instructions you gave Elyra to remember, such as a
  risk limit. Elyra only stores what you state; it doesn't infer them.
- **Price alerts and prediction-market alert rules**, and when each one
  fired.
- **Research reports and backtests** you ran, including the PDFs generated
  for reports, which are stored in private object storage.
- **Watchlists** (markets and prediction markets).
- **Prepared actions**: swaps or transfers Elyra drafted for you to review,
  and the transaction signature once you signed one.
- **Notification preferences** and your **notification inbox**.
- **Points and referrals**.

### Connections you make

- **Hyperliquid**: the address you connect. Read by address; no key.
- **Binance**: a read-only API key and secret you enter once. Before
  storing it we check with Binance that it cannot trade or withdraw. It is
  encrypted (AES-256-GCM) on our server and stored encrypted; only its last
  four characters are stored in readable form, so you can tell which key it
  is. It is never stored on your phone.
- **Polymarket**: the address you link. Read by address; no key.

### Your device (Android app)

- **Push token**: if you allow notifications, an Expo push token for this
  phone, its model name, the app version, and when it last checked in. Used
  only to send you the notifications you chose.
- **Microphone**: only while you hold the dictate button in Ask Elyra.
  The recording is sent to our API to be written out as text, then deleted
  from the phone. We don't keep the recording. The text goes into the
  message box, and nothing is sent until you press send.
- **Camera**: only when you press Scan to read a wallet address's QR code.
  Nothing is recorded or sent.
- **Photos**: only the image you pick to attach to a question.
- **Fingerprint or face**: checked by Android itself before your wallet
  signs. Elyra never receives biometric data.
- **On the phone itself**: preferences (selected market, chart settings,
  starred markets, recent searches, hidden balances), a referral code you
  arrived with, and PDFs you opened. These stay on the phone and aren't
  sent to us.

### Telegram (website only)

If you link Telegram on the website, we store your Telegram user ID and
chat ID so the bot can answer you and send alerts. The Android app has no
Telegram features.

### Technical data

- **Requests to our API** pass through Vercel, which records standard
  request logs (IP address, time, path, status). Our own logs record
  errors, never your messages or keys. **[OPERATOR: confirm Vercel log
  retention for the plan in use.]**
- **Operational records of AI runs**: for each Ask Elyra answer, which
  model answered, whether a fallback was used, how long it took, and any
  error. No message content. These are kept after account deletion, with
  your account removed from them.
- **Usage counts**: how many questions an account asked per day, to apply
  daily limits.

We don't use cookies for advertising or analytics. The website sets a
cookie only to remember a referral link for 30 days and to keep you
signed in (through Privy). **[LAWYER]** Confirm whether a cookie notice is
required for these in the jurisdictions you serve.

## Who we share it with (processors)

We share data only with the services that make Elyra work, and only what
each needs. None of them may use it for their own advertising.
**[LAWYER]** Confirm a data processing agreement (DPA) is in place with each
processor that holds personal data, and list international transfer
safeguards (e.g. Standard Contractual Clauses) for each.

| Service | What it receives | Why |
|---|---|---|
| **Privy** (Privy Inc.) | Your sign-in details and linked accounts; it secures the embedded wallet | Sign-in and the embedded wallet |
| **Supabase** | Everything in "What you create", your connections (keys encrypted), referral, push token | Our database and private file storage |
| **Vercel** | Every API request, as it passes through (see Technical data) | Hosts the website and the API |
| **Upstash** | Market data only (prices, cached public responses) | A cache. No personal data |
| **Anthropic** | Your question, attachments, the conversation so far, your memory, and the results of the tools Elyra used to answer — which may include your balances, holdings, positions and alerts | Writing the answer |
| **Google (Gemini API)** | The same as Anthropic, only when Anthropic is unavailable; and voice recordings to be written out as text | A fallback model, and dictation |
| **Expo** and **Google Firebase Cloud Messaging** | Your push token, and each notification's title and short text | Delivering push notifications to Android |
| **Pyth** (Pyth Data Association / Douro Labs) | Which prices to fetch. No personal data | Prices |
| **Jupiter** | For a swap: the tokens, the amount and your wallet address | Quoting and building the swap you then sign |
| **Solana RPC provider — Helius** | Your wallet address, and for a transfer or swap the signed transaction | Reading your balance and activity, and sending your transactions. **[OPERATOR: confirm Helius is the RPC in production.]** |
| **Birdeye** | Your wallet address | Token balances and prices for your wallet |
| **Kamino** | Your wallet address | Your Kamino lending positions |
| **Hyperliquid** | Your connected address | Your Hyperliquid balances and positions |
| **Binance** | Your read-only API key (decrypted only for the request) | Your Binance balances |
| **Polymarket** | Your linked address; market lookups | Your positions and market data |
| **TradingView** | The chart's market symbol, and your IP address as your browser or the app loads its widget | The price chart |
| **SEC EDGAR, Yahoo Finance, Raydium, Parqet, CoinMarketCap logos** | Public market lookups and logo images. No personal data | Research data and logos |
| **Telegram** (website only) | Your messages to the bot and its replies | The Telegram bot |

When you connect a venue or swap through Jupiter, that service's own terms
and privacy policy also apply to what it does with the request.

Wallet addresses and transactions on Solana and other blockchains are
public. Anyone can see them; that isn't something we control.

**[LAWYER]** Decide whether a public wallet address combined with account
data is personal data in your jurisdictions (it usually is under GDPR) and
whether the AI providers' data-use terms (training, retention) need to be
stated here. **[OPERATOR: confirm the Anthropic and Gemini API terms in use —
in particular whether inputs may be retained or used for training.]**

## Why we use it (legal bases)

**[LAWYER]** Map each purpose to a legal basis. Suggested starting point:

- Providing Elyra (account, answers, alerts, connections, notifications):
  performance of a contract.
- Security, abuse prevention, daily limits, operational records:
  legitimate interests.
- Push notifications, microphone, camera, photos: your choice, asked in
  context; you can turn each off at any time.
- Referral credit: legitimate interests / contract (the referral terms).

## How long we keep it

| Data | Kept |
|---|---|
| Account, conversations, memory, alerts, reports and their PDFs, backtests, watchlists, connections, preferences, inbox, points, referrals | Until you delete them or delete your account |
| Push token | Until you sign out on that phone, the token stops working, or you delete your account |
| Push delivery receipts | Checked about 15 minutes after sending, then kept with the device record |
| Prediction-market order book snapshots (public data, not personal) | 90 days |
| Operational records of AI runs | Kept, with the account removed, after deletion |
| Vercel request logs | Per Vercel's retention **[OPERATOR: confirm]** |
| Database backups | **[OPERATOR: confirm Supabase backup retention for the plan in use; deleted data remains in backups until they expire.]** |

**[LAWYER]** Decide whether indefinite retention of conversations until the
person deletes them is acceptable, or whether an automatic limit is needed.

## Deleting your account

In the app: **Account → Settings → Delete account**. You confirm twice
(the second time by typing DELETE). This deletes:

- your profile, and everything tied to it: devices, inbox, alerts and
  alert rules, conversations and memory, reports and their stored PDFs,
  backtests, exchange and Polymarket connections and their keys,
  watchlists, referrals and points, prepared actions and preferences, and a
  Telegram link;
- your Privy user, so the login can't be used with Elyra again.

It is the same account as the website's, so it's deleted there too. The app
then signs out and clears what it kept on the phone.

It does **not** delete:

- your **on-chain history**: transactions on a blockchain are public and
  permanent, and nobody can remove them;
- your **wallet**: its funds stay at its address. If it's an Elyra embedded
  wallet, export its key on the website first (Wallet → Export wallet) or
  move the funds, because you won't be able to sign in to reach it after
  deletion.

If you can't use the app, email ayushkmrjha@gmail.com from the address you
sign in with, and we'll delete the account for you.
**[OPERATOR: decide how you verify such a request.]**

## Your rights

Depending on where you live, you may have the right to access, correct,
export, restrict or object to our use of your data, and to complain to a
data protection authority. Email ayushkmrjha@gmail.com to use any of them.
**[LAWYER]** List the rights that apply (GDPR, UK GDPR, CCPA/CPRA, India's
DPDP Act, others where you have users), the response time, and the
supervisory authority.

## Children

Elyra is not for anyone under 18. We don't knowingly collect data from
children. **[LAWYER]** Confirm the minimum age for your jurisdictions and
the store's rating.

## Security

Keys you connect are encrypted on our server. Every request is
authenticated with a short-lived token, and each query is limited to your
own account. Signing happens in your wallet, never on our servers. No
system is perfectly secure; if a breach affects you, we'll tell you as the
law requires. **[LAWYER]** Breach notification commitments.

## International transfers

Our processors are based in, or process data in, the United States and
other countries. **[LAWYER]** Name the transfer mechanisms.

## Changes

We'll post any change here with a new date, and tell you in the app for a
material one.

## Contact

ayushkmrjha@gmail.com
