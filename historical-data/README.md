# historical-data

CLI utility for pulling NBA game and player data for a single season directly from the NBA Stats API.

## Requirements

- Node.js 18 or newer (for the built-in `fetch` implementation).

## Installation

From the project root:

```bash
npm install
```

No additional dependencies are required.

## Usage

Fetch the latest season (determined from the current date):

```bash
npm run fetch
```

Fetch a specific season by start year (e.g., the 2019-20 season):

```bash
npm run fetch -- --year 2019
```

All downloads are written to the `data/` directory (created automatically if needed) using filenames of the form `nba-data-<year>.json`, where `<year>` is the starting year of the season. The game payload now includes `playerStats` arrays containing the individual box-score lines for that team in the game.

### Notes

- The CLI fetches exactly one NBA season per invocation to simplify rate-limit handling.
- The NBA Stats API enforces rate limits. The script spaces requests to remain polite, but repeated full-history runs may still require pauses between seasons.
- NBA Stats endpoints occasionally change their response schema. If an endpoint begins returning errors, review `src/nbaApi.js` for adjustments.
