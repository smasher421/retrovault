# Player guide

[← RetroVault overview](../README.md) · [Open the app](https://retrovault-eta.vercel.app) · [Developer setup](development.md)

## Start with Steam

Steam is the sign-in method, including when you want to track GOG or manually added games. RetroVault redirects you to Steam to authenticate; it does not ask you to enter a Steam password in the app.

After signing in, open **My Library** and choose **Sync Steam**. Steam's **Profile → Edit Profile → Privacy Settings → Game details** must be **Public** for owned games and playtime to be returned. RetroVault's own public/private setting is separate.

The first import assigns **Playing** to games with reported playtime and **Backlog** to games without it. Later syncs keep your chosen status, ratings, reviews, notes, and favorites. New playtime increases appear in Activity; this feed is based on syncs, not a live session recorder.

## Find your way around

| Section | Use it for |
| --- | --- |
| **Home** | Collection totals, recent games, backlog picks, and shortcuts. Click the logo to return here. |
| **My Library** | Your collection, filters, sync, grid/list view, and backlog roulette. |
| **Add Games** | Search suggestions and manual game entries. |
| **Wishlist** | Your favorited collection entries. The current Wishlist is the favorite-based view, not a separate store wishlist import. |
| **Reviews** | Select a game, read English Steam reviews, or browse RetroVault reviews. |
| **My Profile** | Bio, stats, own reviews, connected accounts, and theme previews. |
| **Achievements** | Steam unlocks and RetroAchievements progress. |
| **Platforms / genres** | Discover suggestions for a chosen system or type of game. |
| **Stores** | Open the Steam/GOG shelves or visit other listed storefronts. |
| **Activity** | Playtime increases recorded when you sync. |

On narrow screens, open **Browse** to reveal the navigation. Selecting a destination closes it again.

## Add console games and other editions

1. Open **Add Games** and start typing a title.
2. Pick a matching suggestion. The app fills in available metadata; select the platform/edition you own before saving.
3. Choose a status, optionally add notes, and select **Add to my vault**.
4. If search cannot find the release, enter it manually. A cover image URL is optional.

Search combines RetroVault's cached catalog, GameDB, and RAWG when configured. Suggestions can be filtered by platform and genre. Check the release year when a game has a remake or several editions.

Use **Platforms** for a system directory or choose a platform directly from the sidebar. Discovery recommendations are curated and do not represent every game released for that system. Adding a console game does not connect a console account or import its playtime.

## Organize the library

- **Statuses:** Backlog, Playing, Completed, 100% Completed, and Abandoned.
- **Views:** the compact list is the default; **Grid** switches to posters. Both use 24 games per page and follow your search/status filters.
- **Favorites:** use the star or the game actions menu. Favorites also appear in the current Wishlist view.
- **Game actions:** right-click a library game or choose **Actions**. Open details, write/edit a review, edit notes or purchase price, manage favorites, remove the entry, or launch a Steam game.
- **Keyboard menu controls:** arrow keys move between actions; Home/End jump to the first/last action; Escape closes the menu and restores focus.
- **Roulette:** **Backlog roulette** picks a Backlog game and shows a preview. Steam launch links require the Steam desktop client.

The optional purchase price records what you paid. It is separate from a store's current offer and is used by Vault Audit to calculate recorded cost and cost per tracked play hour.

## Open a game, browse images, write a review

Click the title or cover to open its dossier. Available information includes descriptions, release details, platforms, developers/publishers, scores, artwork, and screenshots. Metadata varies by game and provider.

Click a screenshot to preview it **inside RetroVault**. Use the on-screen controls or arrow keys to navigate; Escape closes the preview.

Personal actions appear before community reviews. Choose **Write a review** for an owned entry or **Add & write review** for a catalog title. Ratings use a 1–10 scale. Your review is public only while your RetroVault profile is public.

### Review filters and pages

| Feed | Available controls |
| --- | --- |
| **Steam community** | English reviews; helpful, recent, or updated order; all, positive, or negative sentiment. |
| **RetroVault community** | Newest, highest, or lowest rating; rating category filters. The Reviews page can also filter by game. |
| **My Profile → My reviews** | Your own reviews; recently updated or highest rated order. |

Community feeds show **five reviews per page**. Long text has **Read more / Show less**. Your profile's own-review list uses six per page. If a filter returns no reviews, try a broader filter or another feed.

## Connect GOG

GOG is linked to your existing Steam-signed-in vault; it is not a separate RetroVault login.

1. Go to **My Profile → Connected accounts** and choose **Connect GOG**.
2. Choose **Open secure GOG sign-in** and sign in on GOG's own page.
3. GOG finishes on an `embed.gog.com/on_login_success` address. Copy that full address from the browser and paste it into RetroVault's **GOG success URL** field.
4. Select **Connect & sync library** within ten minutes of starting the connection.
5. Keep RetroVault open while the import progresses. You can resume a pending import by returning to the app; later imports use **Sync GOG library**.

Treat the temporary GOG success URL like a sign-in credential: do not paste it into issues, reviews, or screenshots.

The import includes owned GOG games and available Galaxy playtime. Games from other stores linked inside Galaxy are excluded. Imported Steam and GOG editions stay separate. Existing personal statuses, reviews, notes, and favorites survive re-syncs.

Some games have no Galaxy statistics, so **Playtime unavailable** is expected for those entries. The first sync establishes a baseline; later playtime increases become Activity events. Disconnecting GOG removes saved account access but keeps imported collection entries and reviews.

This integration uses GOG desktop interfaces and a manual redirect handoff. It is not an official registered RetroVault integration and can be affected by provider changes.

## Browse stores and discover games

**Steam Store** offers Top Sellers, Most Played, New Releases, and Specials. **GOG Store** offers Bestsellers, Classics, New on GOG, and Deals. Open a product for its details or add it to Backlog without owning it yet.

Prices currently use **Romania** as the store region. When available, the app shows original/current price, currency, and discount. Missing offers say **Price unavailable**; explicitly free products say **Free**. Offers cache for ten minutes, so confirm the price on the original store before buying. Other directory storefronts open externally.

## Achievements

### Steam

Open **Achievements**, choose Steam, and select a synced Steam game. View unlocked and remaining achievements, completion totals, and available unlock dates. Data depends on the game's achievement support and your Steam privacy settings; not every game has achievements.

### RetroAchievements

Choose the retro source and enter your **RetroAchievements username**. Browse supported games, completion progress, and individual unlocks. Progress comes from that service, not from importing a ROM or manually adding a game to your vault.

The host must configure a RetroAchievements API key. Hosted-site users do not need to enter a key in RetroVault. For a separate installation, the developer sets `RETROACHIEVEMENTS_API_KEY` on the server and can set `RETROACHIEVEMENTS_USERNAME` as a default. Coverage depends on the supported game/system and provider data.

## Personalize and share

Choose a skin in **My Profile** or **Settings**. Presets apply throughout the site and clear custom color overrides. Settings lets you change background, panel, accent, and text colors; **Save custom colors** persists them and **Use theme colors** restores the current preset.

Profiles start **private**. Open **My Profile → Profile visibility & sharing** to reach the sharing controls (the sidebar entry is currently **People you follow**). Enabling sharing makes your collection and reviews eligible for public views and enables a public completion badge. The app provides a public profile link and a Markdown badge snippet there.

This setting is independent of Steam's privacy controls. Turning on Steam Game details for syncing does not automatically make your RetroVault profile public.

The LAN Party Matcher compares your collection against another public RetroVault profile. Enter their 17-digit Steam ID. Shared games also need co-op or multiplayer metadata to be returned.

## Common questions

| Problem | What to try |
| --- | --- |
| **Steam sign-in fails** | Start a new sign-in from the [canonical site](https://retrovault-eta.vercel.app), rather than reusing an old callback URL. |
| **Steam sync returns no games** | Check Steam Game details privacy. If still empty, report the error text; the host may need to check provider access. |
| **GOG connection expired** | Start a fresh Connect GOG flow and paste the new success URL within ten minutes. |
| **GOG sync stopped** | Return to My Profile and resume/retry the import. Previously imported batches remain saved. |
| **A game, score, image, or achievement is missing** | Provider coverage varies. Try catalog search or a manual entry; report the exact title, year, platform, and missing field. |
| **Public profile cannot be opened** | Enable RetroVault profile sharing. A private profile intentionally has no public page or badge. |
| **Steam Play link does nothing** | Install/open the Steam client and allow the browser's Steam protocol handoff. Console/manual games have no Steam launch link. |

Still stuck? [Report a bug](https://github.com/smasher421/retrovault/issues/new/choose) with the page, game/platform, steps, and error message. Do not include API keys, session cookies, passwords, or GOG sign-in URLs.
