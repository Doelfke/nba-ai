import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

// Load environment variables
dotenv.config({ path: ".env.local" });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Pinecone client
const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey) {
  console.error("PINECONE_API_KEY environment variable not set");
  process.exit(1);
}

const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) {
  console.error("OPENAI_API_KEY environment variable not set");
  process.exit(1);
}

const pc = new Pinecone({ apiKey });
const denseIndex = pc.index("nba-dense");
const openai = new OpenAI({ apiKey: openaiKey });

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "NBA AI Chat API is running" });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log(`Received query: ${message}`);

    const searchResults = await denseIndex.namespace("nba-data").searchRecords({
      query: {
        topK: 100,
        inputs: { text: message },
      },
    });

    // Build context from search results
    const context = (searchResults.result?.hits || [])
      .map((hit) => hit.fields?.text || "")
      .filter(Boolean)
      .join("\n\n");

    console.log("Context for answer generation:", context);

    // Generate answer using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an NBA expert assistant. Answer questions based only on the provided context. Be concise and accurate. If the context doesn't contain enough information to answer, say so.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion: ${message}`,
        },
      ],
      max_tokens: 5000,
    });

    const answer =
      completion.choices[0]?.message?.content || "Unable to generate answer.";

    res.json({
      query: message,
      answer,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🏀 NBA AI Chat API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
});
