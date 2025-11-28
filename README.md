# NBA AI

An AI-powered NBA data platform that uses vector search and LLMs to answer questions about NBA games, players, and statistics.

## Projects

### `/historical-data`

Fetches and stores historical NBA game data (2024-2025 seasons) from the NBA API. Outputs JSON files used for vectorization.

### `/upcoming-data`

Fetches upcoming/scheduled NBA games from the NBA API. Outputs JSON files for upcoming game information.

### `/vectorize-data`

Processes NBA JSON data and uploads it to Pinecone as vector embeddings. Creates the `nba-dense` index used by the chat API for semantic search.

### `/chat`

Express.js API server that powers the chat interface. It searches NBA data using Pinecone vector search and generates natural language answers using OpenAI GPT-4o.

**Endpoints:**

- `GET /health` - Health check
- `POST /api/chat` - Send a question, get an AI-generated answer
