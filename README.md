# GitHub Issues Wall Display

A real-time GitHub issues monitoring dashboard optimized for wall displays, TV screens, and team dashboards. Track the most interacted-with issues across any public or private repository.

![Dark Theme](https://img.shields.io/badge/theme-dark-0d1117?style=flat-square)
![Light Theme](https://img.shields.io/badge/theme-light-f6f8fa?style=flat-square&labelColor=fff)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen?style=flat-square)
![License MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

## Features

- **Universal** — Works with any GitHub repository (public or private)
- **Interaction Scoring** — Ranks issues by a composite score of comments, reactions, recency, and velocity
- **Heat Map** — Visual heat levels (1-5) highlight the hottest issues at a glance
- **Dark / Light Themes** — Toggle between themes or auto-detect from OS preference
- **Real-Time Updates** — Configurable polling intervals with countdown bar and connection status
- **Wall Display Optimized** — Large typography, high contrast, responsive from mobile to 4K
- **Zero Dependencies** — Pure HTML, CSS, and JavaScript. No build step required
- **Persistent Config** — Saves your settings in localStorage for instant reload

## Quick Start

### Option 1: Open directly

```
Just open index.html in your browser.
```

### Option 2: Local server

```bash
npx serve .
```

### Option 3: Clone and run

```bash
git clone https://github.com/YOUR_USERNAME/github-issues-wall.git
cd github-issues-wall
npm start
```

Then open `http://localhost:3000` in your browser.

## Setup

1. Enter any GitHub repository in `owner/repo` format (e.g., `facebook/react`)
2. Optionally add a [Personal Access Token](#github-token) for higher rate limits
3. Choose your refresh interval and number of issues to display
4. Click **Connect & Launch**

## GitHub Token

A Personal Access Token is **optional** for public repos but recommended:

| | Without Token | With Token |
|---|---|---|
| Rate Limit | 60 requests/hour | 5,000 requests/hour |
| Public Repos | Yes | Yes |
| Private Repos | No | Yes |

**To create a token:**

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select scope: `public_repo` (or `repo` for private repos)
4. Copy the token and paste it into the setup form

Your token is stored **only** in your browser's localStorage and is never sent anywhere except GitHub's API.

## Interaction Score

Issues are ranked by a weighted interaction score:

```
score = (comments × 3 + reactions × 5 + velocity × 10) × recencyMultiplier
```

| Signal | Weight | Description |
|---|---|---|
| Comments | ×3 | Total comment count |
| Reactions | ×5 | Total reactions (thumbs up, heart, rocket, etc.) |
| Velocity | ×10 | Comments per day since creation |
| Recency | ×0.8 – ×2.0 | Multiplier based on time since last update |

Issues are then assigned a **heat level** (1-5) relative to the top-scoring issue.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | Refresh issues now |
| `T` | Toggle dark/light theme |
| `Esc` | Back to settings |

## Project Structure

```
├── index.html              # Single-page application
├── css/
│   ├── main.css            # Theme system, base components
│   ├── wall-display.css    # Cards, header, footer, animations
│   └── responsive.css      # Mobile to 4K breakpoints
└── js/
    ├── github-api.js       # GitHub API client with scoring engine
    ├── real-time-updates.js # Polling manager with countdown
    └── app.js              # Application logic and rendering
```

## Wall Display Tips

- Use **Chrome Kiosk Mode** for a clean fullscreen experience:
  ```bash
  chrome --kiosk http://localhost:3000
  ```
- Or simply open `index.html` directly — no server needed:
  ```bash
  start index.html
  ```
- Set refresh interval to **5-15 minutes** for wall displays to conserve API rate limits
- The dark theme works best in dimly lit environments; light theme for bright offices

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)
