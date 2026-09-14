# Confluence Desk — Strategy Dashboard

A React + Vite dashboard that runs a trend/pullback strategy check on crypto (Binance, no key needed), forex, metals, and stocks (Twelve Data, needs a free API key).

⚠️ **Educational tool only — not financial advice.**

## 1. Run it locally

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. Crypto works immediately (Binance public API). For forex/metals/stocks, get a free key at [twelvedata.com](https://twelvedata.com) and paste it into the input field shown when those tabs are selected.

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: strategy dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

## 3. Set the base path (important)

Open `vite.config.js` and set `base` to match your repo name:

```js
base: "/<your-repo-name>/",
```

- If you're deploying to `https://<username>.github.io/<repo-name>/` → use `"/<repo-name>/"` (this is the default already set to `/strategy-dashboard/` — change it if you rename the repo).
- If this repo **is** your `<username>.github.io` root-site repo → use `"/"`.

## 4. Enable GitHub Pages

In your GitHub repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

A workflow at `.github/workflows/deploy.yml` is already included — it builds the app and deploys `dist/` to GitHub Pages automatically on every push to `main`. No extra setup needed beyond selecting "GitHub Actions" as the source once.

After the first push, check the **Actions** tab for build progress. Your site will be live at:

```
https://<your-username>.github.io/<your-repo-name>/
```

## 5. Manual build (optional)

```bash
npm run build
npm run preview
```

## Notes on API keys

The Twelve Data key is entered client-side and stored only in component state (not persisted, not sent anywhere except directly to Twelve Data's API from the browser). Don't commit real API keys to the repo.
# strategy-dashboard
