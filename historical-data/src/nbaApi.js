import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "https://stats.nba.com/stats";
const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Connection: "keep-alive",
  Host: "stats.nba.com",
  Referer: "https://stats.nba.com/",
  Origin: "https://stats.nba.com",
  "sec-ch-ua": '"Chromium";v="120", "Not(A:Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

const DEFAULT_DELAY_MS = 400;
const MAX_RETRIES = 3;

const SEASON_TYPES = ["Regular Season", "Playoffs"];

function buildUrl(endpoint, params) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, value);
  });
  return url;
}

async function fetchJson(endpoint, params, attempt = 1) {
  const url = buildUrl(endpoint, params);
  const response = await fetch(url, {
    headers: COMMON_HEADERS,
    // Request NBA Stats endpoints as closely to a browser call as possible.
    referrer: "https://stats.nba.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
  });

  if (!response.ok) {
    if (response.status === 404) {
      const notFoundError = new Error(
        `NBA API returned 404 for ${endpoint}. The requested resource might not exist for the given season.`
      );
      notFoundError.status = response.status;
      notFoundError.endpoint = endpoint;
      throw notFoundError;
    }
    if (
      attempt < MAX_RETRIES &&
      (response.status >= 500 || response.status === 429)
    ) {
      const waitTime = DEFAULT_DELAY_MS * Math.pow(2, attempt - 1);
      await delay(waitTime);
      return fetchJson(endpoint, params, attempt + 1);
    }
    const body = await response.text();
    const preview = body.length > 200 ? `${body.slice(0, 200)}...` : body;
    const error = new Error(
      `NBA API request failed (${response.status}) [${endpoint}]: ${preview}`
    );
    error.status = response.status;
    error.endpoint = endpoint;
    throw error;
  }

  return response.json();
}

function resultSetToObjects(resultSet) {
  const headers = resultSet.headers;
  return resultSet.rowSet.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return record;
  });
}

async function fetchSeasonGames(seasonString) {
  const allGames = [];

  for (const seasonType of SEASON_TYPES) {
    let data;
    try {
      data = await fetchJson("leaguegamelog", {
        Counter: "0",
        Direction: "ASC",
        LeagueID: "00",
        PlayerOrTeam: "T",
        Season: seasonString,
        SeasonType: seasonType,
        Sorter: "DATE",
      });
    } catch (error) {
      if (error.status === 404) {
        console.warn(
          `No game data found for ${seasonString} (${seasonType}); continuing.`
        );
        continue;
      }
      throw error;
    }

    if (!data.resultSets || !data.resultSets.length) {
      continue;
    }

    const games = resultSetToObjects(data.resultSets[0]).map((game) => ({
      ...game,
      SEASON_TYPE: seasonType,
    }));

    allGames.push(...games);
    await delay(DEFAULT_DELAY_MS);
  }

  return allGames;
}

async function fetchSeasonPlayers(seasonString) {
  let data;
  try {
    data = await fetchJson("commonallplayers", {
      IsOnlyCurrentSeason: "0",
      LeagueID: "00",
      Season: seasonString,
    });
  } catch (error) {
    if (error.status === 404) {
      console.warn(`No player data found for ${seasonString}; continuing.`);
      return [];
    }
    throw error;
  }

  if (!data.resultSets || !data.resultSets.length) {
    return [];
  }

  await delay(DEFAULT_DELAY_MS);
  return resultSetToObjects(data.resultSets[0]);
}

async function fetchSeasonPlayerGameStats(seasonString) {
  const allStats = [];

  for (const seasonType of SEASON_TYPES) {
    let data;
    try {
      data = await fetchJson("leaguegamelog", {
        Counter: "0",
        Direction: "ASC",
        LeagueID: "00",
        PlayerOrTeam: "P",
        Season: seasonString,
        SeasonType: seasonType,
        Sorter: "DATE",
      });
    } catch (error) {
      if (error.status === 404) {
        console.warn(
          `No player game stats found for ${seasonString} (${seasonType}); continuing.`
        );
        continue;
      }
      throw error;
    }

    if (!data.resultSets || !data.resultSets.length) {
      continue;
    }

    const stats = resultSetToObjects(data.resultSets[0]).map((record) => ({
      ...record,
      SEASON_TYPE: seasonType,
    }));

    allStats.push(...stats);
    await delay(DEFAULT_DELAY_MS);
  }

  return allStats;
}

function toSeasonString(startYear) {
  const endYear = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYear}`;
}

export async function fetchSeasonDataset(startYear) {
  const seasonString = toSeasonString(startYear);

  const [games, players, playerGameStats] = await Promise.all([
    fetchSeasonGames(seasonString),
    fetchSeasonPlayers(seasonString),
    fetchSeasonPlayerGameStats(seasonString),
  ]);

  const statsByGameAndTeam = new Map();
  for (const stat of playerGameStats) {
    const teamId = stat.TEAM_ID ?? stat.PLAYER_TEAM_ID;
    if (!teamId || !stat.GAME_ID) {
      continue;
    }
    const key = `${stat.GAME_ID}_${teamId}`;
    if (!statsByGameAndTeam.has(key)) {
      statsByGameAndTeam.set(key, []);
    }
    statsByGameAndTeam.get(key).push(stat);
  }

  const gamesWithPlayerStats = games.map((game) => {
    const key = `${game.GAME_ID}_${game.TEAM_ID}`;
    return {
      ...game,
      playerStats: statsByGameAndTeam.get(key) ?? [],
    };
  });

  return {
    season: seasonString,
    startYear,
    downloadedAt: new Date().toISOString(),
    source: "stats.nba.com",
    games: gamesWithPlayerStats,
    players,
  };
}

export function validateSeasonYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1946) {
    throw new Error("Season year must be an integer no earlier than 1946.");
  }
  return year;
}
