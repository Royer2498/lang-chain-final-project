import "dotenv/config";

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  maxQueryLength: 500,
  retrieverK: 5,
  similarityThreshold: 0.68,
  chunkSize: 2000,
  chunkOverlap: 200,
  temperature: 0.2,
};
