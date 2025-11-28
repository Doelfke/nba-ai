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

/**
 * Calculates the NBA season string (e.g., "2025-26") for a given date.
 * NBA season typically starts in October, so dates Oct-Dec belong to the
 * season starting that year, while Jan-Sep belong to the season that started
 * the previous year.
 */
function getSeasonForDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0 = Jan, 9 = Oct)
  // If Oct-Dec, season starts this year; otherwise, it started last year
  const startYear = month >= 9 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

/**
 * Converts schedule date format "MM/DD/YYYY 00:00:00" to "YYYY-MM-DD"
 */
function normalizeScheduleDate(dateStr) {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

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
    referrer: "https://stats.nba.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
  });

  if (!response.ok) {
    if (response.status === 404) {
      const notFound = new Error(
        `NBA API returned 404 for ${endpoint}. Requested resource not available.`
      );
      notFound.status = response.status;
      notFound.endpoint = endpoint;
      throw notFound;
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

export async function fetchUpcomingSchedule(dateStrings) {
  if (!dateStrings.length) {
    return [];
  }

  // Determine which season(s) we need to fetch based on the requested dates
  const seasons = new Set();
  for (const dateStr of dateStrings) {
    const date = new Date(dateStr);
    seasons.add(getSeasonForDate(date));
  }

  // Build a Set of requested dates for quick lookup
  const requestedDates = new Set(dateStrings);

  // Fetch schedule data for each season
  const allGames = new Map(); // date -> games[]

  for (const season of seasons) {
    let data;
    try {
      console.log(`Fetching schedule for ${season} season...`);
      data = await fetchJson("scheduleleaguev2", {
        LeagueID: "00",
        Season: season,
      });
    } catch (error) {
      if (error.status === 404) {
        console.warn(
          `No schedule data found for season ${season}; continuing.`
        );
        continue;
      }
      throw error;
    }

    const gameDates = data.leagueSchedule?.gameDates ?? [];

    for (const gameDate of gameDates) {
      // Convert "MM/DD/YYYY 00:00:00" to "YYYY-MM-DD"
      const normalizedDate = normalizeScheduleDate(gameDate.gameDate);
      if (!normalizedDate || !requestedDates.has(normalizedDate)) {
        continue;
      }

      const games = (gameDate.games ?? [])
        .filter((game) => game.gameStatus === 1) // Status 1 = not yet started
        .map((game) => ({
          date: normalizedDate,
          gameId: game.gameId,
          gameCode: game.gameCode,
          statusId: game.gameStatus,
          statusText: game.gameStatusText,
          gameTimeUTC: game.gameDateTimeUTC,
          gameTimeET: game.gameDateTimeEst,
          arenaName: game.arenaName,
          arenaCity: game.arenaCity,
          arenaState: game.arenaState,
          homeTeam: {
            teamId: game.homeTeam?.teamId,
            teamName: game.homeTeam?.teamName,
            teamCity: game.homeTeam?.teamCity,
            teamTricode: game.homeTeam?.teamTricode,
            wins: game.homeTeam?.wins,
            losses: game.homeTeam?.losses,
          },
          visitorTeam: {
            teamId: game.awayTeam?.teamId,
            teamName: game.awayTeam?.teamName,
            teamCity: game.awayTeam?.teamCity,
            teamTricode: game.awayTeam?.teamTricode,
            wins: game.awayTeam?.wins,
            losses: game.awayTeam?.losses,
          },
        }));

      if (!allGames.has(normalizedDate)) {
        allGames.set(normalizedDate, []);
      }
      allGames.get(normalizedDate).push(...games);
    }

    await delay(DEFAULT_DELAY_MS);
  }

  // Build the schedule result in the order of requested dates
  const schedule = [];
  for (const dateString of dateStrings) {
    schedule.push({
      date: dateString,
      games: allGames.get(dateString) ?? [],
    });
  }

  return schedule;
}

const ESPN_INJURIES_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";

/**
 * Fetches all current NBA players and returns:
 * - playerMap: Map of player name (lowercase) -> NBA player ID
 * - teamMap: Map of team abbreviation (lowercase) -> NBA team ID
 */
async function fetchPlayerAndTeamMaps() {
  const season = getSeasonForDate(new Date());

  try {
    const data = await fetchJson("commonallplayers", {
      IsOnlyCurrentSeason: "1",
      LeagueID: "00",
      Season: season,
    });

    const resultSet = data.resultSets?.[0];
    if (!resultSet) {
      console.warn("No player data returned from NBA API.");
      return { playerMap: new Map(), teamMap: new Map() };
    }

    const headers = resultSet.headers;
    const personIdIdx = headers.indexOf("PERSON_ID");
    const displayNameIdx = headers.indexOf("DISPLAY_FIRST_LAST");
    const teamIdIdx = headers.indexOf("TEAM_ID");
    const teamAbbrevIdx = headers.indexOf("TEAM_ABBREVIATION");

    const playerMap = new Map();
    const teamMap = new Map();

    for (const row of resultSet.rowSet) {
      const playerId = row[personIdIdx];
      const displayName = row[displayNameIdx];
      const teamId = row[teamIdIdx];
      const teamAbbrev = row[teamAbbrevIdx];

      if (playerId && displayName) {
        // Normalize name to lowercase for matching
        playerMap.set(displayName.toLowerCase(), playerId);
      }

      if (teamId && teamAbbrev) {
        // Normalize abbreviation to lowercase for matching
        teamMap.set(teamAbbrev.toLowerCase(), teamId);
      }
    }

    console.log(
      `Loaded ${playerMap.size} players and ${teamMap.size} teams from NBA API.`
    );
    return { playerMap, teamMap };
  } catch (error) {
    console.warn(`Failed to fetch player/team data: ${error.message}`);
    return { playerMap: new Map(), teamMap: new Map() };
  }
}

export async function fetchInjuryReport() {
  // The NBA stats.nba.com/stats/injuryreport endpoint has been deprecated.
  // Using ESPN's public API as an alternative source for injury data.
  // We also fetch NBA player/team IDs to enrich the data.

  try {
    // Fetch player/team ID maps and ESPN injuries in parallel
    const [{ playerMap, teamMap }, espnResponse] = await Promise.all([
      fetchPlayerAndTeamMaps(),
      fetch(ESPN_INJURIES_URL, {
        headers: {
          "User-Agent": COMMON_HEADERS["User-Agent"],
          Accept: "application/json",
        },
      }),
    ]);

    if (!espnResponse.ok) {
      console.warn(
        `ESPN injury API returned ${espnResponse.status}; returning empty list.`
      );
      return [];
    }

    const data = await espnResponse.json();
    const injuries = [];

    // Transform ESPN's format to a flat list of injuries
    for (const teamData of data.injuries ?? []) {
      const teamInfo = teamData.team ?? {};

      for (const injury of teamData.injuries ?? []) {
        const athlete = injury.athlete ?? {};
        const details = injury.details ?? {};
        const team = athlete.team ?? teamInfo;
        const playerName = athlete.displayName ?? null;
        const teamAbbrev = team.abbreviation ?? null;

        // Look up NBA player ID using the player name
        const nbaPlayerId = playerName
          ? playerMap.get(playerName.toLowerCase()) ?? null
          : null;

        // Look up NBA team ID using the team abbreviation
        const nbaTeamId = teamAbbrev
          ? teamMap.get(teamAbbrev.toLowerCase()) ?? null
          : null;

        injuries.push({
          // Player info
          playerId: nbaPlayerId,
          espnPlayerId: athlete.id ?? null,
          playerName,
          firstName: athlete.firstName ?? null,
          lastName: athlete.lastName ?? null,
          position: athlete.position?.abbreviation ?? null,

          // Team info
          teamId: nbaTeamId,
          espnTeamId: team.id ?? null,
          teamName: team.displayName ?? null,
          teamAbbreviation: team.abbreviation ?? null,

          // Injury info
          status: injury.status ?? null,
          injuryType: details.type ?? null,
          injuryLocation: details.location ?? null,
          injuryDetail: details.detail ?? null,
          injurySide: details.side ?? null,
          returnDate: details.returnDate ?? null,

          // Comments
          shortComment: injury.shortComment ?? null,
          longComment: injury.longComment ?? null,

          // Metadata
          date: injury.date ?? null,
          source: "ESPN",
        });
      }
    }

    console.log(`Fetched ${injuries.length} injuries from ESPN.`);
    return injuries;
  } catch (error) {
    console.warn(`Failed to fetch injury report: ${error.message}`);
    return [];
  }
}
