# Loop & Locket

A pastel online shop for handmade crochet, lockets, and gifts. Hosted on Firebase (project `loopandlocket30`), with payments by Stripe Checkout.

- `public/`: the website (plain HTML/CSS/JS, no build step)
- `public/products.json`: **every product, price, and shipping setting.** Edit this to change the shop.
- `functions/`: one Cloud Function, `checkout`, that turns the cart into a Stripe payment page

## Editing products

Each product in `public/products.json` looks like this:

```json
{
  "id": "mini-frog",                  // used in the link: /#/p/mini-frog. Don't change it once live.
  "name": "Mini Frog Buddy",
  "category": "Crochet",              // must match one of "categories" at the top
  "price": 14.00,                     // in dollars
  "tint": "mint",                     // card color: pink, mint, lavender, butter, sky, peach
  "featured": true,                   // optional: shows first and in the banner
  "stock": 3,                         // optional: 0 = sold out, 1-5 shows "Only N left", leave out = unlimited
  "images": ["images/mini-frog.jpg"], // optional: put photos in public/images/. Square photos look best.
  "description": "…",
  "details": ["About 3 in tall", "…"]
}
```

Products with no images get a pastel drawing for their category. Shipping (flat rate, free-shipping threshold, allowed countries) is in `"shipping"` at the top of the file.

Stock is **not** counted down automatically when something sells. Lower `stock` yourself and redeploy.

## Deploy

The Firebase project is on the shop's Google account, so log that account into the CLI first (one time):

```
firebase login:add          # sign in with the account that owns loopandlocket30
firebase login:use <that-email>
```

Then publish the site:

```
firebase deploy --only hosting
```

The site is live at https://loopandlocket30.web.app. Until the function below is deployed, the shop works but the Checkout button says checkout isn't available.

## Turning on payments (one time)

1. In the Firebase console, upgrade `loopandlocket30` to the **Blaze** (pay-as-you-go) plan. Cloud Functions need it; a small shop stays inside the free allowance.
2. Make a Stripe account and copy the **secret key** (Developers → API keys). Use the `sk_test_…` key first to try it out.
3. Store the key in Firebase (it's never put in the code):
   ```
   firebase functions:secrets:set STRIPE_SECRET_KEY
   ```
4. Install and deploy the function:
   ```
   cd functions
   npm install
   cd ..
   firebase deploy
   ```

To test, check out with card `4242 4242 4242 4242`, any future date, any CVC. When it works, run step 3 again with the live `sk_live_…` key and redeploy with `firebase deploy --only functions`.

Orders show up in the Stripe dashboard under Payments, including the shipping address. Turn on email receipts in Stripe (Settings → Emails) so buyers get one automatically.

**After any change to `products.json`, run `firebase deploy`** (not just hosting) so checkout charges the new prices.

## Preview locally

```
firebase emulators:start --only hosting
```

then open http://localhost:5000. Checkout won't work in the preview.
