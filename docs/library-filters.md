# Find something you actually want to play

Open **My Library** to combine title search, status, genre, playtime and platform. Results are filtered before the 24-game pages are calculated. **Backlog roulette** uses every matching Backlog game, including games on other pages. Excluded entries and games marked Not Interested are omitted from roulette.

Use **Advanced filters** to open the grouped controls. Each group can be collapsed. Active filter chips can be removed individually; **Clear all** restores the default library with hidden games excluded. **Copy filters** copies the filter settings as JSON. Named searches are saved to your account, so they are available after logging in on another device. Up to 25 searches can be saved and deleted.

## Three layers of filtering

| Layer | Available controls |
| --- | --- |
| Library basics | Title, status, genre, provider/personal tags, platform, OS, library source, developer, publisher, franchise, release year/decade, game type, free/paid, date added, favorites, hidden entries, playtime and last played. |
| Backlog planning | Priority, backlog state, play intention, completion goal, first playthrough/replay/New Game+, campaign progress and completion date, personal rating, time estimates, remaining time, session length and long term commitment. |
| Discovery and compatibility | Mood, atmosphere, setting, experience, visual style, soundtrack, perspective, world structure, combat, story focus, difficulty, pace, replayability, progression, multiplayer/co-op types, controller, Deck, Cloud, Workshop, Remote Play, VR, offline, HDR, ultrawide, resolution, installation size, local installation, launcher and languages. |
| Achievement and review facts | Unlocked percentage, achievement total/remaining, perfect games and completion date, Steam positive percentage/review count/sentiment/popularity, Metacritic and your personal rating. |

Sort ascending or descending by title, date added, playtime, last played, release year, Steam positive percentage, Metacritic, estimated completion, achievement progress, personal rating, priority or installation size. **Shuffle** keeps its order until **Reshuffle** is selected. Unavailable values sort last in either direction.

## Numbers, ranges and search operators

Numeric fields accept an exact number, a comparison such as `<2` or `>=80`, an inclusive range such as `2..10`, or `unknown`. Playtime and estimates use hours, campaign/achievement progress use percentages, Steam positive reviews and Metacritic use 0–100, and your rating uses 1–10. Quick playtime presets use an inclusive lower boundary and exclusive upper boundary; for example 2–10h includes 2h and excludes 10h.

Examples for the main search field:

```text
genre:rpg status:unplayed playtime:<2h hltb:<20h
tag:"Open World" year:2000..2010 -tag:"Multiplayer"
status:playing achievements:>80% rating:>=90 platform:windows
priority:High progress:>=50 sort:estimated-asc
"Half-Life" -"Deathmatch"
```

Plain words search the title. Quotes keep a multi-word value together. Prefix a word or operator with `-` to exclude it. Operators combine with the visible filters. `status:unplayed` means Backlog; `dropped` means Abandoned. `platform:windows`, `platform:linux` and `platform:macos` match supported operating systems. `hltb` is an alias for the selected completion estimate; that estimate can be manual or sourced, so the operator does not imply automatic HLTB access. `rating` means Steam positive percentage; `myrating` means your rating. The full list of supported keys is shown in **Search syntax & data sources**. Invalid or unfinished operators show an error instead of applying an incomplete search.

## Smart collections

| Collection | Rule |
| --- | --- |
| Unplayed | Backlog and exactly 0 recorded minutes. |
| Finish in a weekend | Unfinished and a known selected completion estimate below 8h. |
| Almost 100% | At least 80% and below 100% of achievements unlocked. |
| Hidden gems | At least 80% positive Steam reviews, at least 50 reviews, and below 2h played. |
| Tonight pick | Unfinished singleplayer games with a known estimate below 5h. |
| Forgotten games | Started, unfinished, and a known last session more than 365 days ago. |

Unfinished excludes Completed, 100% Completed and Abandoned. Smart collection counts describe the full default library; selecting one combines its rule with your current filters. Campaign completion and achievement completion remain independent.

## Record your plans

Choose **Actions → Planning & progress**, or open a game and select **Planning & progress**. Your personal record includes priority, progress, hidden/installed state, play intentions, estimates, manual tags and experience/compatibility classifications. These fields are private. Hidden games are excluded from your public profile and its totals.

Leave a field blank to use provider data where it exists, or keep the value unknown. Manual values take precedence. Manual total hours and last session are useful for console games without an automatic playtime provider. The application cannot inspect your computer to determine installation state, storage requirements or hardware support.

Main story, main plus extras and completionist estimates are independent. Set their source/link alongside the durations. Remaining hours can be entered manually; otherwise they are estimated from the selected duration and your manually recorded campaign percentage. RAWG's average player playtime is **not** treated as completion time.

The HowLongToBeat section accepts an exact game URL or numeric game ID. The server attempts to read the public title page, then shows the title and durations for you to review before applying them. Automated access returned HTTP 403 during implementation. When blocked, enter the durations and source link manually. There is no supported automatic HLTB search or guarantee of coverage.

## Refresh data without slowing library startup

Open **Refresh library data** and choose:

- **Refresh metadata & tags:** fetch Steam store genres, release/developer/publisher details, actual user tags, operating systems, registered features, Steam review aggregates and Deck compatibility. Linked non-Steam RAWG entries can fetch tags and platform information when the host has configured its key.
- **Refresh Steam achievements:** fetch your Steam achievement progress for linked games. The Achievements page also caches a successful game's summary for later library filtering.

Refreshes process at most four owned games per request and report progress and unavailable results. **Stop after this batch** retains everything already fetched. Keep RetroVault open while refreshing; starting another refresh reuses cached metadata. Successful metadata is cached for seven days; incomplete results use a shorter one-hour cache. Steam privacy settings, delisted games, age gates, rate limits or unavailable providers can leave fields unknown. Failed requests do not replace recorded achievement progress with zero or remove existing metadata.

Steam user tags are distinct from genres and store feature categories. Mood/experience filters can match corresponding provider tags (for example Horror → Scary) or your manual classification. Successful Steam feature lists are used for registered Cloud, Workshop, controller and VR support; finer hardware/language details may need manual entry. GOG/manual games without recorded playtime are unknown, rather than silently treated as never played. Recent two-week Steam playtime is populated on the next library sync.

Provider references: [Steam tags](https://partner.steamgames.com/doc/store/tags), [Steam review API](https://partner.steamgames.com/doc/store/getreviews), [HowLongToBeat](https://howlongtobeat.com/).
