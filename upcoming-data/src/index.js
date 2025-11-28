import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fetchInjuryReport, fetchUpcomingSchedule } from "./nbaApi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DEFAULT_DAYS = 7;
const MAX_DAYS = 14;

function parseCliArgs(argv) {
  const args = {
    days: DEFAULT_DAYS,
    date: undefined,
  };
  let daysExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--days": {
        const value = argv[++index];
        if (!value) {
          throw new Error("--days requires a numeric value");
        }
        const parsedDays = Number(value);
        if (!Number.isInteger(parsedDays) || parsedDays < 1) {
          throw new Error("--days must be a positive integer");
        }
        if (parsedDays > MAX_DAYS) {
          throw new Error(`--days cannot exceed ${MAX_DAYS}`);
        }
        args.days = parsedDays;
        daysExplicit = true;
        break;
      }
      case "--date":
        args.date = argv[++index];
        if (!args.date) {
          throw new Error("--date requires a value in YYYY-MM-DD format");
        }
        break;
      case "--help":
      case "-h":
        return { help: true };
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (args.date && daysExplicit) {
    throw new Error("Use either --date or --days, not both.");
  }

  return args;
}

function assertValidDateString(value) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(value)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date value provided.");
  }
  return value;
}

function buildDateList(args) {
  if (args.date) {
    return [assertValidDateString(args.date)];
  }

  const dates = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < args.days; offset += 1) {
    const next = new Date(start);
    next.setUTCDate(start.getUTCDate() + offset);
    dates.push(next.toISOString().slice(0, 10));
  }
  return dates;
}

function printUsage() {
  const help =
    `Usage: npm run fetch -- [options]\n\n` +
    `Options:\n` +
    `  --days <N>   Fetch upcoming games for the next N days (default ${DEFAULT_DAYS}, max ${MAX_DAYS}).\n` +
    `  --date <YYYY-MM-DD>   Fetch upcoming games for a specific date.\n` +
    `  --help        Show this message.\n`;
  console.log(help);
}

async function main() {
  try {
    const parsed = parseCliArgs(process.argv.slice(2));
    if (parsed.help) {
      printUsage();
      return;
    }

    const dateStrings = buildDateList(parsed);
    if (!dateStrings.length) {
      throw new Error("No dates requested.");
    }

    await mkdir(DATA_DIR, { recursive: true });

    console.log(`Fetching upcoming games for ${dateStrings.join(", ")}...`);
    const [schedule, injuries] = await Promise.all([
      fetchUpcomingSchedule(dateStrings),
      fetchInjuryReport(),
    ]);

    const aggregatedGames = schedule.flatMap((entry) => entry.games);

    const payload = {
      generatedAt: new Date().toISOString(),
      request: {
        mode: parsed.date ? "specific-date" : "rolling-window",
        dates: dateStrings,
        totalGames: aggregatedGames.length,
      },
      games: aggregatedGames,
      injuries,
    };

    const filePath = path.join(DATA_DIR, `nba-upcoming.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

    console.log(`Saved ${filePath}`);
    console.log("Completed successfully.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    printUsage();
    process.exitCode = 1;
  }
}

main();
