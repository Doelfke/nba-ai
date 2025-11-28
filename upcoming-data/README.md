# upcoming-data

CLI utility for pulling the latest upcoming NBA games (with team IDs) and the current league injury report, saving everything as JSON.

## Requirements

- Node.js 18 or newer (for the built-in `fetch`).

## Installation

From the project root:

```bash
npm install
```

No additional dependencies are required.

## Usage

Fetch upcoming games for the next 7 days (default window):

```bash
npm run fetch
```

Fetch upcoming games for a specific date (UTC, `YYYY-MM-DD`):

```bash
npm run fetch -- --date 2025-11-28
```

Fetch upcoming games for the next 3 days:

```bash
npm run fetch -- --days 3
```

All downloads are written to the `data/` directory (created automatically if needed) using filenames of the form `nba-upcoming-<timestamp>.json`.

### Notes

- The script calls the NBA Stats `scheduleleaguev2` endpoint to fetch the full season schedule, then filters for the requested dates.
- Only games with `gameStatus = 1` (not yet started) are included.
- The script automatically determines the correct NBA season based on the requested dates.
- Injury data is sourced from ESPN's public API since the NBA's official injury endpoint has been deprecated.
- Rate limiting may apply. Re-run the script if a request fails due to a transient error.
