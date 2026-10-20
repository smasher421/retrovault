# Contributing to RetroVault

Bug reports, game-data corrections, documentation improvements, and feature ideas are welcome through [GitHub Issues](https://github.com/smasher421/retrovault/issues/new/choose).

## Report a bug

Include:

- The page or action: Steam sync, Add Games, a storefront, reviews, achievements, or another section.
- Steps to reproduce, what you expected, and what happened.
- The exact game title, release year, platform, and source when relevant. Different editions often have different metadata.
- Browser/device, error text, and a screenshot if it helps.

Remove API keys, passwords, cookies, personal account data, and temporary GOG sign-in URLs from reports and screenshots.

## Suggest a feature

Describe the problem you want to solve and the action you would like to take in RetroVault. Include a concrete example. For a new store or platform integration, explain whether you need discovery, ownership import, playtime, achievements, or several of those; they are separate capabilities.

## Work on the project

1. Read the [developer guide](docs/development.md) for Node.js 24, environment setup, migrations, and local startup. Use your own development database and credentials.
2. Keep the change focused. For a large feature or a new integration, open an issue first to discuss its scope.
3. Preserve the classic VGUI presentation: square frames, theme tokens, readable labels, visible keyboard focus, and working narrow-screen layouts. Use existing components and providers where possible.
4. Before opening a pull request, run `npm run lint` and `npm run build`. For GOG server changes, also run `npm run test:server`; it uses simulated providers/database responses.
5. Explain what changed, why, what you checked, and any provider limitations. Include before/after screenshots for UI changes and update the relevant documentation.

Keep credentials in your ignored `.env` file. Provider keys and database service-role access belong on the server; never add a `VITE_` prefix to a secret.
