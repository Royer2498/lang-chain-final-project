import { RunnableLambda } from "@langchain/core/runnables";
import { config } from "../config.js";

// Contextual Compression via similarity threshold:
// embeds the query, scores every stored chunk, drops chunks below the
// similarityThreshold, and returns the top-K survivors.
// This is the same goal as LLMChainExtractor / EmbeddingsFilter but
// implemented without extra API calls or @langchain/community.
export function createCompressedRetriever(vectorStore, embeddings) {
  return new RunnableLambda({
    func: async (query) => {
      const queryEmbedding = await embeddings.embedQuery(query);
      const results = await vectorStore.search(queryEmbedding);
      return results
        .filter((r) => r.score >= config.similarityThreshold)
        .slice(0, config.retrieverK)
        .map((r) => r.doc);
    },
  });
}
