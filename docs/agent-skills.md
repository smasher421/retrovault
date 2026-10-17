# Coding agent skills

Installed on 2026-10-17 for this Windows user in `C:\Users\Keylin\.agents\skills`. These are coding-agent tools, not application dependencies. Existing MCP configuration and the REA skill were preserved.

Codex discovers personal skills from `.agents/skills` as documented in [Build skills](https://learn.chatgpt.com/docs/build-skills). Use a skill by name, for example `$prompt-improver`. New skills are available on a subsequent turn; restart the client if they do not appear.

## Installed upstream skills

| Skills | Source | Pinned revision |
| --- | --- | --- |
| `frontend-design` | [Anthropic skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` |
| `karpathy-guidelines` | [Multica's Karpathy guidelines adaptation](https://github.com/multica-ai/andrej-karpathy-skills) | `2c606141936f1eeef17fa3043a72095b4765b9c2` |
| `firecrawl`, `firecrawl-developer-index` | [Firecrawl CLI skills](https://github.com/firecrawl/cli/tree/main/skills) | `085e0c1189343d7bda7240324fe8546f03f0c5b5` |
| `differential-review` | [Trail of Bits differential review](https://github.com/trailofbits/skills/tree/master/plugins/differential-review) | `5c99c03fb8a9ea568432ecbcba5d86e9f4ac2bf0` |
| `codeql`, `semgrep`, `sarif-parsing` | [Trail of Bits static analysis](https://github.com/trailofbits/skills/tree/master/plugins/static-analysis) | `5c99c03fb8a9ea568432ecbcba5d86e9f4ac2bf0` |

The Karpathy skill is a community implementation of his coding heuristics, not a release authored by Karpathy. Upstream skill directories are installed locally with their supporting files; they are not vendored into RetroVault. Their licenses and instructions remain with their respective repositories.

`skill-creator` and `skill-installer` were already supplied by Codex in `.codex/skills/.system`; no duplicate was installed. PyYAML 6.0.3 was installed in the user's Python environment for the creator's validation utility.

## Custom skills maintained in this repository

Their editable sources live under [`tooling/skills`](../tooling/skills), and copies are installed in the personal skill directory. This location deliberately avoids a second active repository skill with the same name.

| Skill | What it does |
| --- | --- |
| [`prompt-improver`](../tooling/skills/prompt-improver/SKILL.md) | Drafts or refines a prompt; concise, complete, or balanced modes; preserves constraints and returns a usable prompt. |
| [`research-skill`](../tooling/skills/research-skill/SKILL.md) | Produces a bounded, cited research dossier with primary evidence, competing explanations, counterfactuals, and uncertainty. Writes Markdown through an available, authorized MCP destination, or uses a disclosed local file fallback. |
| [`tone-apply`](../tooling/skills/tone-apply/SKILL.md) | Applies an explicit tone profile while preserving facts. The initial profile is provisional, based on this conversation's communication preferences; no mailbox or private document corpus was mined. |
| [`frontend-design-system`](../tooling/skills/frontend-design-system/SKILL.md) | Preserves theme tokens, typography, spacing, component states, accessibility and image roles. Complements Anthropic's visual design skill. |

These four skills were created for the described workflows; the first three descriptions did not identify a specific upstream package. Each has a `SKILL.md` and `agents/openai.yaml`; all passed the bundled skill-creator structure validator.

Example invocations:

```text
$prompt-improver Shorten this prompt without dropping requirements: ...
$research-skill Research these options and save research/options.md: ...
$tone-apply Rewrite this README introduction in my work tone: ...
$frontend-design-system Extend this dialog using the existing VGUI themes.
```

After editing a custom skill source, validate it and copy the changed files into the matching personal skill directory. Skill files contain reusable instructions, not credentials.

## Tools and authentication

- **Firecrawl CLI 1.26.8** was installed using npm. `firecrawl --version` and `firecrawl --status` ran successfully. Status reports **not authenticated**. The upstream developer index documents keyless access with lower limits; account-only features require `firecrawl login --browser`. No Firecrawl account was connected and no API key was written. Research caches are ignored via `.firecrawl/`.
- **CodeQL and Semgrep skills are installed; their scanner executables are not installed or available on PATH.** A requested security audit must first resolve the appropriate scanner/runtime and any licensing constraints, then report which analyses actually ran. Installing these skills is not an audit result.
- CLI tools are preferred when they provide the needed capability. No additional Chrome DevTools, Jira, Figma, logging, or database MCP was installed from the quoted discussion; those examples were not specific integration requests.

## Game details implementation in the same update

Game dossiers now show metadata and screenshots before personal actions, followed by community reviews. Both sources use five reviews per page; long reviews have an explicit expansion control. Steam reviews use English, helpful/newest/updated ordering and sentiment filters. RetroVault reviews use rating filters and server-side pagination, with profile visibility applied before counting and paging.

The Steam adapter follows the current [IUserReviewsService documentation](https://partner.steamgames.com/doc/webapi/IUserReviewsService): anonymous service requests, `input_json`, enum filters, opaque cursors and `total_matching`. RetroVault pagination follows Supabase's [inner-join filtering](https://supabase.com/docs/reference/javascript/select) and [ordered ranges](https://supabase.com/docs/reference/javascript/range).

RAWG background artwork no longer overwrites an existing catalog cover. Opening an affected GameDB title recovers its original IGDB cover; failed recovery leaves the existing image available. Landscape images retain their aspect ratio in the dossier. Request sequence guards prevent a delayed detail response from replacing another game's content.
