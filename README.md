# Loop & Locket

A pastel online shop for handmade crochet, lockets, and gifts. Hosted on Firebase (project `loopandlocket30`, owned by `loopandlocket26@gmail.com`) on the free Spark plan. Uses Firebase Authentication for accounts and Stripe Payment Links for payments, with no database or server.

- `public/`: the website (plain HTML/CSS/JS, no build step)
- `public/products.json`: every product. Edit this to change the shop.

## Products

Each product in `public/products.json` looks like this:

```json
{
  "id": "mini-frog",                                   // used in the link: /#/p/mini-frog
  "name": "Mini Frog Buddy",
  "category": "Crochet",                               // must match one of "categories" at the top
  "price": 14.00,                                      // shown on the site; Stripe charges what the Payment Link says
  "tint": "mint",                                      // card color: pink, mint, lavender, butter, sky, peach
  "featured": true,                                    // optional: shows first and in the banner
  "soldOut": true,                                     // optional: shows "Sold out" instead of Buy now
  "stripeLink": "https://buy.stripe.com/…",            // the product's Payment Link; empty shows "Coming soon"
  "images": ["images/mini-frog.jpg"],                  // optional: put photos in public/images/. Square looks best.
  "description": "…",
  "details": ["About 3 in tall", "…"]
}
```

Products without photos get a pastel drawing for their category.

## Payments (Stripe Payment Links)

For each product, in the Stripe dashboard:

1. Go to **Payment Links** and click **New**. Add the product at the same price as `products.json`.
2. Under **Options**:
   - Turn on **Collect customers' addresses** (shipping, US only).
   - Add a **shipping rate**.
   - Turn on **Let customers adjust quantity** if you want.
3. Under **After payment**, choose **Don't show confirmation page** and redirect to `https://loopandlocket30.web.app/#/thanks`.
4. Create the link, then paste it into that product's `"stripeLink"`.

When a shopper is signed in, "Buy now" fills in their email at checkout. It also tags the payment with their account ID, which shows as "client reference ID" on the payment in Stripe.

Orders, shipping addresses, and refunds are all in the Stripe dashboard under **Payments**. Turn on email receipts in Stripe (Settings → Emails) so buyers get one.

Use test mode links (`buy.stripe.com/test_…`) and card `4242 4242 4242 4242` to try it first.

## Accounts

Shoppers can sign in with Google or with an email and password.

One-time setup in the Firebase console, signed in as the owner:

1. Build → **Authentication** → Get started.
2. Turn on **Google** and **Email/Password**.

## Deploy

```
firebase deploy
```

The site is live at https://loopandlocket30.web.app.

## Updating the Firebase SDK

The Firebase SDK is self-hosted in `public/js/vendor/firebase.js`, because Safari can block it when it's loaded from Google's servers. To update it:

1. Change the `firebase` version in `package.json`.
2. Run `npm install` and then `npm run build:firebase`.
3. If the site needs a new Firebase function, add it to `tools/firebase-entry.js`.
