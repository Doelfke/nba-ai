import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fetchSeasonDataset, validateSeasonYear } from "./nbaApi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");

function getCurrentSeasonStartYear(now = new Date()) {
  const month = now.getMonth() + 1; // 1-indexed month
  const year = now.getFullYear();
  return month >= 7 ? year : year - 1;
}

function parseCliArgs(argv) {
  const args = {
    year: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--year":
      case "-y":
        args.year = argv[++index];
        break;
      case "--help":
      case "-h":
        return { help: true };
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function getRequestedSeason(argv) {
  const parsed = parseCliArgs(argv);

  if (parsed.help) {
    return { season: undefined, showHelp: true };
  }

  if (parsed.year !== undefined) {
    return { season: validateSeasonYear(parsed.year) };
  }

  return { season: getCurrentSeasonStartYear() };
}

function printUsage() {
  const help =
    `Usage: npm run fetch -- [options]\n\n` +
    `Options:\n` +
    `  --year <YYYY>   Fetch a specific season (e.g., 2019 for the 2019-20 season).\n` +
    `  --help          Show this message.\n`;
  console.log(help);
}

async function main() {
  try {
    const { season, showHelp } = getRequestedSeason(process.argv.slice(2));

    if (showHelp) {
      printUsage();
      return;
    }

    await mkdir(DATA_DIR, { recursive: true });

    console.log(
      `Fetching ${season}-${String((season + 1) % 100).padStart(
        2,
        "0"
      )} data...`
    );
    const dataset = await fetchSeasonDataset(season);
    const filePath = path.join(DATA_DIR, `nba-data-${season}.json`);
    await writeFile(filePath, JSON.stringify(dataset, null, 2), "utf8");
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
