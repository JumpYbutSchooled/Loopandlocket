# Loop & Locket

A pastel online shop for handmade crochet, lockets, and gifts. Hosted on Firebase (project `loopandlocket30`, owned by `loopandlocket26@gmail.com`), with payments by Stripe Checkout.

- `public/`: the website (plain HTML/CSS/JS, no build step)
- `functions/`: `checkout` (turns the cart into a Stripe payment page) and `stripeWebhook` (marks orders paid)
- `firestore.rules`, `storage.rules`: who can read and change what

## Accounts

- **Shoppers** can create an account with Google or email + password. Signed-in shoppers see their orders on the Account page. Checking out without an account also works.
- **The owner** (`loopandlocket26@gmail.com`) sees an **Admin** button in the header. The admin page lets them:
  - add, edit, and delete products, including uploading photos
  - see paid orders with shipping addresses, and mark them shipped
  - change categories and shipping prices

The owner should sign in with **Continue with Google**. Owner access needs a verified email, which Google sign-in always has.

To add another owner, add their email to the list in **both** `firestore.rules` and `storage.rules`, then run `firebase deploy --only firestore:rules,storage`.

## One-time setup (Firebase console, signed in as the owner)

1. **Upgrade to Blaze** (pay-as-you-go): ⚙️ → Usage and billing. Photo uploads and checkout need it. A small shop stays inside the free allowance.
2. **Firestore**: Build → Firestore Database → Create database. Use production mode and location `nam5 (United States)`.
3. **Storage**: Build → Storage → Get started. Use the same US location.
4. **Authentication**: Build → Authentication → Get started. Turn on **Google** and **Email/Password**.

Then deploy everything except payments:

```
firebase deploy --only hosting,firestore,storage
```

## Turning on payments

1. Make a Stripe account and copy the **secret key** (Developers → API keys). Start with the `sk_test_…` key.
2. Store it in Firebase (it's never put in the code):
   ```
   firebase functions:secrets:set STRIPE_SECRET_KEY
   ```
3. In Stripe → Developers → Webhooks, add an endpoint:
   - URL: `https://us-central1-loopandlocket30.cloudfunctions.net/stripeWebhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`

   Copy its signing secret (`whsec_…`) and store it:
   ```
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```
4. Deploy:
   ```
   cd functions
   npm install
   cd ..
   firebase deploy
   ```

To test, check out with card `4242 4242 4242 4242`, any future date, and any CVC. The order should appear under Admin → Orders.

To go live:
- Repeat steps 2 and 3 with the live key and a live-mode webhook.
- Run `firebase deploy --only functions`.
- Turn on email receipts in Stripe (Settings → Emails).

## How orders work

1. **Checkout** reads prices from Firestore, so shoppers can't change what they pay. It saves a `pending` order and sends the shopper to Stripe.
2. **When the payment succeeds**, Stripe calls `stripeWebhook`. It marks the order `paid`, saves the shipping address, and lowers each product's stock.
3. **If a checkout is abandoned**, the pending order is deleted when Stripe expires the session (24 hours).

Refunds and payouts are handled in the Stripe dashboard.

## Updating the Firebase SDK

The Firebase SDK is self-hosted in `public/js/vendor/firebase.js`, because Safari can block it when it's loaded from Google's servers. To update it:

1. Change the `firebase` version in `package.json`.
2. Run `npm install` and then `npm run build:firebase`.
3. If the site needs a new Firebase function, add it to `tools/firebase-entry.js`.
