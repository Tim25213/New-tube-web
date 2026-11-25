# NewTube Web

Live at **https://tim25213.github.io/new-tube-web/**

An ad-free YouTube site with a light, iOS-style liquid glass design. You can sign in with your Google account to get your own recommendations, subscriptions and history. It's free to host: the website runs on **GitHub Pages** and a small backend runs on **Cloudflare Workers**.

Unofficial. Inspired by [NewTube](https://github.com/aleixrodriala/newtube) and [SmartTube](https://github.com/yuliskov/SmartTube). Not affiliated with YouTube or Google.

## What it does

- **No ads.** Videos play in its own player (Shaka) from YouTube's raw video streams. There's no ad code and no YouTube tracking script. Ad and promo slots are also removed from every list.
- **Google sign-in with a code**, the same way a smart TV does it: you get a code and enter it at google.com/device. After that, Home shows your recommendations, Subscriptions shows your feed, and Library has your YouTube history. You can also like videos and subscribe.
- **Works without signing in.** Subscriptions, Watch later and history are saved in your browser. Home then fills up with videos related to what you've watched.
- **SponsorBlock** skips sponsors and intros. **Return YouTube Dislike** shows dislike counts. There are no Shorts.
- Quality picker up to 1080p, playback speed, comments, clickable timestamps, resume where you left off, lock-screen controls, light and dark mode.
- On a phone, use "Add to Home Screen" and it opens full screen like an app.

## Set it up (about 5 minutes, free)

### 1. Backend: Cloudflare Worker
1. Make a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Create Worker**, name it `newtube-web` and press **Deploy**.
3. Press **Edit code**. Delete everything in the editor, paste in all of `worker/worker.js`, and press **Deploy**.
4. Copy the Worker's address. It looks like `https://newtube-web.YOURNAME.workers.dev`.

### 2. Website: GitHub Pages
1. Create a new public repository, for example `newtube-web`.
2. Upload **everything in this folder** to the root of the repo (`index.html` has to be at the top level).
3. Open `config.js` and paste in your Worker address:
   ```js
   window.NT_CONFIG = { workerUrl: "https://newtube-web.YOURNAME.workers.dev" };
   ```
4. In the repo, go to **Settings → Pages → Build and deployment**. Pick **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
5. After about a minute the site is live at `https://YOURNAME.github.io/newtube-web/`.

### 3. Lock the Worker to your site (recommended)
In Cloudflare, open the Worker and go to **Settings → Variables and Secrets → Add**:
`ALLOWED_ORIGINS` = `https://YOURNAME.github.io`
This stops other websites from using your Worker.

### 4. Sign in
Open the site, go to **Settings**, tap **Sign in**, and enter the code at google.com/device.

## If something doesn't work
Go to **Settings → Run diagnostics** and tap **Copy report**. It checks the backend, search, Home, sign-in and the video player one at a time, so the report shows which step fails.

- **A video falls back to "YouTube's own player":** YouTube refused to hand the raw stream to your Worker for that video. This happens with some music videos and age-restricted videos, and it's the only case where ads can show up. Live streams always use YouTube's player.
- **Home is empty when signed out:** watch or search for a few videos. Home builds itself from what you've watched.
- **Sign-in fails:** YouTube may have changed its TV sign-in client. You can set `TV_CLIENT_ID` and `TV_CLIENT_SECRET` as Worker variables to override it.

## Privacy
Your sign-in token, history and subscriptions are stored only in your browser. The Worker stores nothing. It just passes requests along to YouTube and Google.

## Limits
- Cloudflare's free plan allows 100,000 requests a day. Video is loaded in chunks, so that's plenty for one person or a family, but not for a public site.
- YouTube changes its internals often. The page parser is tolerant of most changes, and you can update it by editing `js/parse.js` without touching the Worker.

## Files
```
index.html, styles.css, config.js     the site
js/app.js                             screens and navigation
js/api.js                             talks to your Worker, handles sign-in
js/parse.js                           turns YouTube's data into lists (drops ads and Shorts)
js/player.js                          ad-free player and SponsorBlock
vendor/shaka-player.compiled.js       Shaka Player 4.16.54 (Apache-2.0)
worker/worker.js                      the Cloudflare Worker
```
