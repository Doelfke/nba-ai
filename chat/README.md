# NBA AI Chat

A Node.js API for chatting with NBA data using Pinecone vector search.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file with your Pinecone API key:

```
PINECONE_API_KEY=your-pinecone-api-key-here
PORT=3000
```

3. Start the development server:

```bash
npm run dev
```

## API Endpoints

### Health Check

- **GET** `/health`
- Returns server status

### Chat

- **POST** `/api/chat`
- Body: `{ "message": "your NBA question here" }`
- Returns relevant NBA data based on your query

## Example Usage

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the odds of the nuggets winning against the spurs?  Take into consideration previous games and current injuries. Respond with the team names, with percentages only and list all current injuries briefly."}'
```

## Features

- Vector search through NBA game data
- Player statistics and team performance
- Game results and historical data
- Injury reports and upcoming games
- Semantic search using Pinecone embeddings

## Project Structure

```
chat/
├── src/
│   └── index.js          # Main API server
├── package.json          # Dependencies and scripts
├── .env.local           # Environment variables (create this)
└── README.md            # This file
```
