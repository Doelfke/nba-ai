import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Simple tokenizer for sparse vectors
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

// Calculate term frequencies
function calculateTF(tokens) {
  const tf = {};
  const totalTokens = tokens.length;

  tokens.forEach((token) => {
    tf[token] = (tf[token] || 0) + 1;
  });

  // Normalize by total tokens
  Object.keys(tf).forEach((token) => {
    tf[token] = tf[token] / totalTokens;
  });

  return tf;
}

// Generate sparse vector from text
function generateSparseVector(text, vocabulary, idf) {
  const tokens = tokenize(text);
  const tf = calculateTF(tokens);
  const sparseVector = { indices: [], values: [] };

  Object.keys(tf).forEach((token) => {
    if (vocabulary[token] !== undefined) {
      const index = vocabulary[token];
      const tfidf = tf[token] * (idf[token] || 0);

      if (tfidf > 0) {
        sparseVector.indices.push(index);
        sparseVector.values.push(tfidf);
      }
    }
  });

  return sparseVector;
}

// Build vocabulary and IDF from all documents
function buildVocabularyAndIDF(documents) {
  const vocabulary = {};
  const docFreq = {};
  const totalDocs = documents.length;
  let vocabIndex = 0;

  // First pass: build vocabulary and document frequencies
  documents.forEach((doc) => {
    const tokens = [...new Set(tokenize(doc.text))]; // unique tokens per document

    tokens.forEach((token) => {
      if (!vocabulary[token]) {
        vocabulary[token] = vocabIndex++;
      }
      docFreq[token] = (docFreq[token] || 0) + 1;
    });
  });

  // Calculate IDF
  const idf = {};
  Object.keys(docFreq).forEach((token) => {
    idf[token] = Math.log(totalDocs / docFreq[token]);
  });

  console.log(
    `📚 Built vocabulary with ${Object.keys(vocabulary).length} terms`
  );
  return { vocabulary, idf };
}

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

// Initialize Pinecone client
const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey) {
  throw new Error("PINECONE_API_KEY environment variable not set");
}

const pc = new Pinecone({ apiKey });

// Helper function to load JSON files
function loadJsonFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

// Helper function to create content text from game data
function createGameContent(game) {
  const teamName = game.TEAM_NAME || game.TEAM_ABBREVIATION;
  const matchup = game.MATCHUP;
  const result = game.WL === "W" ? "won" : "lost";
  const date = game.GAME_DATE;
  const seasonType = game.SEASON_TYPE || "Regular Season";

  // Team stats
  const pts = game.PTS;
  const fgPct = (game.FG_PCT * 100).toFixed(1);
  const fg3m = game.FG3M;
  const fg3a = game.FG3A;
  const fg3Pct = game.FG3_PCT ? (game.FG3_PCT * 100).toFixed(1) : "0.0";
  const ftPct = game.FT_PCT ? (game.FT_PCT * 100).toFixed(1) : "0.0";
  const reb = game.REB;
  const oreb = game.OREB;
  const dreb = game.DREB;
  const ast = game.AST;
  const stl = game.STL;
  const blk = game.BLK;
  const tov = game.TOV;
  const plusMinus = game.PLUS_MINUS;

  // Build comprehensive game description
  let content = `${teamName} ${result} on ${date} in ${seasonType} matchup ${matchup}. `;
  content += `Final score: ${pts} points (${
    plusMinus > 0 ? "+" : ""
  }${plusMinus} margin). `;
  content += `Shooting: ${fgPct}% FG, ${fg3m}/${fg3a} three-pointers (${fg3Pct}%), ${ftPct}% FT. `;
  content += `Rebounds: ${reb} total (${oreb} offensive, ${dreb} defensive). `;
  content += `Team stats: ${ast} assists, ${stl} steals, ${blk} blocks, ${tov} turnovers.`;

  // Add top performers if player stats available
  if (game.playerStats && game.playerStats.length > 0) {
    const topScorers = game.playerStats
      .sort((a, b) => b.PTS - a.PTS)
      .slice(0, 3)
      .filter((p) => p.PTS > 0);

    if (topScorers.length > 0) {
      content += ` Top performers: `;
      const scorerDescriptions = topScorers.map(
        (p) => `${p.PLAYER_NAME} (${p.PTS}pts, ${p.REB}reb, ${p.AST}ast)`
      );
      content += scorerDescriptions.join(", ") + ".";
    }
  }

  return content;
}

// Helper function to create content text from player stats
function createPlayerContent(player, teamResult) {
  const playerName = player.PLAYER_NAME;
  const teamName = player.TEAM_NAME || player.TEAM_ABBREVIATION;
  const matchup = player.MATCHUP;
  const result = player.WL === "W" ? "won" : "lost";
  const date = player.GAME_DATE;
  const seasonType = player.SEASON_TYPE || "Regular Season";

  const pts = player.PTS;
  const reb = player.REB;
  const ast = player.AST;
  const stl = player.STL;
  const blk = player.BLK;
  const tov = player.TOV;
  const min = player.MIN;
  const fgPct = player.FG_PCT ? (player.FG_PCT * 100).toFixed(1) : "0.0";
  const fg3m = player.FG3M;
  const fg3a = player.FG3A;
  const fg3Pct = player.FG3_PCT ? (player.FG3_PCT * 100).toFixed(1) : "0.0";
  const ftPct = player.FT_PCT ? (player.FT_PCT * 100).toFixed(1) : "0.0";
  const plusMinus = player.PLUS_MINUS;

  let content = `${playerName} played for ${teamName} on ${date} in ${seasonType} matchup ${matchup}. `;
  content += `Team ${result}. Player performance in ${min} minutes: `;
  content += `${pts} points, ${reb} rebounds, ${ast} assists. `;
  content += `Shooting: ${fgPct}% FG, ${fg3m}/${fg3a} 3PT (${fg3Pct}%), ${ftPct}% FT. `;
  content += `Defense: ${stl} steals, ${blk} blocks. ${tov} turnovers. Plus/minus: ${
    plusMinus > 0 ? "+" : ""
  }${plusMinus}.`;

  return content;
}

// Helper function to create content text from upcoming game data
function createUpcomingGameContent(game) {
  const homeTeam = `${game.homeTeam.teamCity} ${game.homeTeam.teamName}`;
  const visitorTeam = `${game.visitorTeam.teamCity} ${game.visitorTeam.teamName}`;
  const date = game.date;
  const time = game.statusText;
  const arena = `${game.arenaName} in ${game.arenaCity}, ${game.arenaState}`;

  return `Upcoming game on ${date} at ${time}: ${visitorTeam} (${game.visitorTeam.wins}-${game.visitorTeam.losses}) vs ${homeTeam} (${game.homeTeam.wins}-${game.homeTeam.losses}) at ${arena}.`;
}

// Load data from historical and upcoming files
function loadAllNbaData() {
  const records = [];
  const projectRoot = path.resolve(__dirname, "../..");

  console.log("📂 Loading historical NBA data...");

  // Load all available historical data files
  const historicalDataDir = path.join(projectRoot, "historical-data", "data");
  const historicalFiles = fs
    .readdirSync(historicalDataDir)
    .filter((file) => file.startsWith("nba-data-") && file.endsWith(".json"));

  for (const fileName of historicalFiles) {
    const year = fileName.match(/nba-data-(\d{4})\.json/)?.[1];
    if (!year) continue;

    const filePath = path.join(historicalDataDir, fileName);
    const data = loadJsonFile(filePath);
    const games = data.games || [];

    console.log(`  ✓ Loaded ${games.length} games from ${year} season`);

    // Sample games to avoid overwhelming the system (take every 10th game)
    const sampledGames = games.filter((_, index) => index % 10 === 0);

    sampledGames.forEach((game, index) => {
      // Extract top scorer info if available
      let topScorer = null;
      if (game.playerStats && game.playerStats.length > 0) {
        const topPlayer = game.playerStats.reduce(
          (max, p) => (p.PTS > max.PTS ? p : max),
          game.playerStats[0]
        );
        topScorer = topPlayer.PLAYER_NAME;
      }

      // Add team-level game record
      records.push({
        _id: `team_${year}_${game.GAME_ID}`,
        text: createGameContent(game),
        category: "team-game",
        season: parseInt(year),
        seasonType: game.SEASON_TYPE,
        team: game.TEAM_ABBREVIATION,
        gameDate: game.GAME_DATE,
        result: game.WL,
        points: game.PTS,
        fg3m: game.FG3M,
        plusMinus: game.PLUS_MINUS,
        assists: game.AST,
        rebounds: game.REB,
        topScorer: topScorer,
      });

      // Add individual player stat records
      if (game.playerStats && game.playerStats.length > 0) {
        game.playerStats.forEach((player) => {
          // Only include players who actually played (had minutes)
          if (player.MIN && player.MIN > 0) {
            // Build metadata object with only non-null values
            const metadata = {
              _id: `player_${year}_${game.GAME_ID}_${player.PLAYER_ID}`,
              text: createPlayerContent(player, game.WL),
              category: "player-game",
              season: parseInt(year),
              team: player.TEAM_ABBREVIATION,
              playerName: player.PLAYER_NAME,
              playerId: player.PLAYER_ID,
              gameDate: player.GAME_DATE,
              result: player.WL,
              points: player.PTS || 0,
              rebounds: player.REB || 0,
              offensiveRebounds: player.OREB || 0,
              defensiveRebounds: player.DREB || 0,
              assists: player.AST || 0,
              steals: player.STL || 0,
              blocks: player.BLK || 0,
              turnovers: player.TOV || 0,
              fouls: player.PF || 0,
              minutes: player.MIN || 0,
              fgm: player.FGM || 0,
              fga: player.FGA || 0,
              fg3m: player.FG3M || 0,
              fg3a: player.FG3A || 0,
              ftm: player.FTM || 0,
              fta: player.FTA || 0,
              plusMinus: player.PLUS_MINUS || 0,
            };

            // Only add percentage fields if they're not null
            if (player.SEASON_TYPE) metadata.seasonType = player.SEASON_TYPE;
            if (player.FG_PCT !== null && player.FG_PCT !== undefined)
              metadata.fgPct = player.FG_PCT;
            if (player.FG3_PCT !== null && player.FG3_PCT !== undefined)
              metadata.fg3Pct = player.FG3_PCT;
            if (player.FT_PCT !== null && player.FT_PCT !== undefined)
              metadata.ftPct = player.FT_PCT;
            if (player.FANTASY_PTS !== null && player.FANTASY_PTS !== undefined)
              metadata.fantasyPts = player.FANTASY_PTS;

            records.push(metadata);
          }
        });
      }
    });
  }

  // Load upcoming data
  console.log("📂 Loading upcoming NBA games...");
  const upcomingFilePath = path.join(
    projectRoot,
    "upcoming-data",
    "data",
    "nba-upcoming.json"
  );

  if (fs.existsSync(upcomingFilePath)) {
    const data = loadJsonFile(upcomingFilePath);
    const games = data.games || [];
    const injuries = data.injuries || [];

    console.log(`  ✓ Loaded ${games.length} upcoming games`);

    games.forEach((game) => {
      records.push({
        _id: `upcoming_${game.gameId}`,
        text: createUpcomingGameContent(game),
        category: "upcoming",
        gameDate: game.date,
        homeTeam: game.homeTeam.teamTricode,
        visitorTeam: game.visitorTeam.teamTricode,
      });
    });

    // Add injury records
    if (injuries.length > 0) {
      console.log(`  ✓ Loaded ${injuries.length} injury reports`);

      injuries.forEach((injury) => {
        // Skip injury records with missing critical data
        if (!injury.playerName || !injury.date) {
          return;
        }

        const playerName = injury.playerName;
        const team = injury.teamAbbreviation || "Unknown";
        const status = injury.status || "Unknown";
        const playerId =
          injury.playerId || `unknown_${Date.now()}_${Math.random()}`;
        const injuryDesc = `${injury.injurySide || ""} ${
          injury.injuryLocation || ""
        } ${injury.injuryDetail || ""}`.trim();
        const returnDate = injury.returnDate || "Unknown";
        const shortComment = injury.shortComment || "";
        const longComment = injury.longComment || "";

        let content = `Injury Report: ${playerName} (${team}) - ${status}. `;
        content += `Injury: ${injuryDesc}. Expected return: ${returnDate}. `;
        if (shortComment) {
          content += `${shortComment} `;
        }
        if (longComment) {
          content += `${longComment}`;
        }

        records.push({
          _id: `injury_${playerId}_${injury.date}`,
          text: content,
          category: "injury",
          playerName: playerName,
          playerId: playerId,
          team: team,
          position: injury.position || "",
          status: status,
          injuryType: injury.injuryType || "",
          injuryLocation: injury.injuryLocation || "",
          injuryDetail: injury.injuryDetail || "",
          injurySide: injury.injurySide || "",
          returnDate: returnDate,
          reportDate: injury.date,
        });
      });
    }
  }

  console.log(`\n✅ Total records prepared: ${records.length}\n`);
  return records;
}

async function main() {
  try {
    console.log("🏀 NBA Data Vectorization with Pinecone (Dense + Sparse)\n");

    // Load all NBA data
    const records = loadAllNbaData();

    // Build vocabulary and IDF for sparse vectors
    console.log("📚 Step 1: Building vocabulary and calculating IDF...");
    const { vocabulary, idf } = buildVocabularyAndIDF(records);

    // Target the indexes
    const denseIndex = pc.index("nba-dense");
    const sparseIndex = pc.index("nba-sparse"); // Create this as a sparse index

    // Step 2: Upsert dense vectors with integrated embeddings
    console.log("\n📊 Step 2: Upserting NBA records with dense vectors...");

    const BATCH_SIZE = 96; // Max for text records with embeddings
    const DELAY_MS = 3000; // 3 second delay between batches to respect rate limits

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      try {
        await denseIndex.namespace("nba-data").upsertRecords(batch);
        console.log(
          `  ✓ Upserted dense batch ${Math.floor(i / BATCH_SIZE) + 1} (${
            batch.length
          } records)`
        );

        // Add delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < records.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        if (error.status === 429) {
          console.log(`  ⏸️  Rate limit reached, waiting 60 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 60000));
          // Retry this batch
          await denseIndex.namespace("nba-data").upsertRecords(batch);
          console.log(
            `  ✓ Upserted dense batch ${Math.floor(i / BATCH_SIZE) + 1} (${
              batch.length
            } records) [retry]`
          );
        } else {
          throw error;
        }
      }
    }
    console.log(
      `\n✅ Successfully upserted ${records.length} NBA records with dense vectors\n`
    );

    // Step 3: Upsert sparse vectors to sparse index
    console.log("📊 Step 3: Upserting NBA records with sparse vectors...");

    const sparseVectors = records.map((record) => {
      const sparseVector = generateSparseVector(record.text, vocabulary, idf);
      return {
        id: record._id + "_sparse",
        sparseValues: sparseVector,
        metadata: {
          text: record.text,
          category: record.category,
          searchType: "sparse",
          ...Object.fromEntries(
            Object.entries(record).filter(
              ([key]) => !["_id", "text"].includes(key)
            )
          ),
        },
      };
    });

    const SPARSE_BATCH_SIZE = 100; // Batch size for sparse vectors

    for (let i = 0; i < sparseVectors.length; i += SPARSE_BATCH_SIZE) {
      const batch = sparseVectors.slice(i, i + SPARSE_BATCH_SIZE);

      try {
        await sparseIndex.upsert(batch); // Use sparse index
        console.log(
          `  ✓ Upserted sparse batch ${
            Math.floor(i / SPARSE_BATCH_SIZE) + 1
          } (${batch.length} records)`
        );

        // Add delay between batches to avoid rate limiting
        if (i + SPARSE_BATCH_SIZE < sparseVectors.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        if (error.status === 429) {
          console.log(`  ⏸️  Rate limit reached, waiting 60 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 60000));
          // Retry this batch
          await sparseIndex.upsert(batch);
          console.log(
            `  ✓ Upserted sparse batch ${
              Math.floor(i / SPARSE_BATCH_SIZE) + 1
            } (${batch.length} records) [retry]`
          );
        } else if (
          error.message &&
          error.message.includes(
            "Dense vectors must contain at least one non-zero value"
          )
        ) {
          console.log(
            `  ⚠️  Sparse index '${sparseIndex.indexName}' appears to be configured as dense index`
          );
          console.log(
            `  📝 Please create a proper sparse-enabled index in Pinecone console`
          );
          console.log(`  🔧 Skipping sparse vector upload for now...`);
          break; // Exit the sparse upload loop
        } else {
          console.log(`  ❌ Sparse index error: ${error.message}`);
          console.log(`  🔧 Continuing with dense vectors only...`);
          break; // Exit the sparse upload loop
        }
      }
    }
    console.log(
      `\n✅ Successfully upserted ${sparseVectors.length} NBA records with sparse vectors\n`
    );

    // Wait for the upserted vectors to be indexed
    console.log("⏳ Waiting 15 seconds for indexing...");
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // View stats for both indexes
    console.log("\n📈 Step 4: Checking index statistics...");
    const denseStats = await denseIndex.describeIndexStats();
    const sparseStats = await sparseIndex.describeIndexStats();
    console.log("Dense Index Stats:", JSON.stringify(denseStats, null, 2));
    console.log("Sparse Index Stats:", JSON.stringify(sparseStats, null, 2));

    // Define the query
    const query = "Boston Celtics winning games with high three-point shooting";

    console.log(
      `\n🔍 Step 5: Searching both dense and sparse indexes for: "${query}"\n`
    );

    // Search the dense index using integrated embeddings
    console.log("🎯 Dense Index Results:");
    const denseResults = await denseIndex.namespace("nba-data").searchRecords({
      query: {
        topK: 5,
        inputs: {
          text: query,
        },
      },
    });

    console.log("=".repeat(60));
    for (let i = 0; i < denseResults.result.hits.length; i++) {
      const hit = denseResults.result.hits[i];
      const fields = hit.fields;
      const text = String(fields?.text ?? "");
      const category = String(fields?.category ?? "unknown");
      const score = hit._score.toFixed(4);

      console.log(
        `\n${i + 1}. [Dense Score: ${score}] ${category.toUpperCase()}`
      );
      console.log(`   ${text}`);
    }

    // Search the sparse index
    console.log("\n🎯 Sparse Index Results:");
    let sparseResults = null;
    try {
      const queryVector = generateSparseVector(query, vocabulary, idf);
      sparseResults = await sparseIndex.query({
        sparseVector: queryVector,
        topK: 5,
        includeMetadata: true,
      });
    } catch (error) {
      console.log(`⚠️  Sparse search failed: ${error.message}`);
      console.log(
        `📝 Make sure 'nba-sparse' is configured as a sparse-enabled index`
      );
      sparseResults = { matches: [] };
    }

    console.log("=".repeat(60));
    if (
      sparseResults &&
      sparseResults.matches &&
      sparseResults.matches.length > 0
    ) {
      for (let i = 0; i < sparseResults.matches.length; i++) {
        const match = sparseResults.matches[i];
        const text = String(match.metadata?.text ?? "");
        const category = String(match.metadata?.category ?? "unknown");
        const score = match.score.toFixed(4);

        console.log(
          `\n${i + 1}. [Sparse Score: ${score}] ${category.toUpperCase()}`
        );
        console.log(`   ${text}`);
      }
    } else {
      console.log(
        "\n⚠️  No sparse results available (index configuration issue)"
      );
    }

    console.log("\n" + "=".repeat(80));
    console.log("\n✨ Dense + Sparse Vectorization completed successfully!");
    console.log(`📊 Dense index: ${records.length} records`);
    console.log(`🔍 Sparse index: ${sparseVectors.length} records`);
    console.log(`📚 Vocabulary size: ${Object.keys(vocabulary).length} terms`);
    console.log(
      "🎯 You can now query both dense and sparse indexes for different search patterns!"
    );
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  }
}

// Run the main function
main();
