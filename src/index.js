import readline from "readline";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { config } from "./config.js";
import { loadAndSplitDocuments } from "./loaders/documentLoader.js";
import { createVectorStore } from "./stores/vectorStore.js";
import { createCompressedRetriever } from "./retrievers/compressedRetriever.js";
import { createRagChain } from "./chains/ragChain.js";

const INJECTION_PATTERN = /ignore (previous|above|all) instructions|you are now|disregard your|forget your (instructions|role)/i;

function validateQuery(query) {
  if (query.length > config.maxQueryLength) {
    return `Query is too long (max ${config.maxQueryLength} characters). Please be more concise.`;
  }
  if (INJECTION_PATTERN.test(query)) {
    return "I can only help with production incidents and operational issues.";
  }
  return null;
}

async function initializeChain() {
  const embeddings = new GoogleGenerativeAIEmbeddings({
    model: config.geminiEmbeddingModel,
    apiKey: config.geminiApiKey,
  });

  const llm = new ChatGoogleGenerativeAI({
    model: config.geminiModel,
    apiKey: config.geminiApiKey,
    temperature: config.temperature,
  });

  const docs = await loadAndSplitDocuments();
  const vectorStore = await createVectorStore(docs, embeddings);
  const retriever = createCompressedRetriever(vectorStore, embeddings);
  return createRagChain(retriever, llm);
}

async function streamWithRetry(chain, query, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chain.stream(query);
    } catch (err) {
      const isRateLimit = err.message?.includes("quota") || err.message?.includes("429");
      if (isRateLimit && attempt < maxRetries) {
        const waitSecs = (attempt + 1) * 15;
        console.log(`\n[Rate limit] Retrying in ${waitSecs}s...`);
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  if (!config.geminiApiKey) {
    console.error("ERROR: GEMINI_API_KEY is not set in your .env file.");
    process.exit(1);
  }

  console.log("==============================================");
  console.log("  Incident Response RAG Assistant");
  console.log(`  Powered by ${config.geminiModel} + LangChain`);
  console.log("==============================================\n");
  console.log("Initializing — loading runbooks and postmortems...\n");

  let chain;
  try {
    chain = await initializeChain();
  } catch (err) {
    console.error("Failed to initialize RAG chain:", err.message);
    process.exit(1);
  }

  console.log("\nReady! Ask me about any production incident or operational issue.");
  console.log("Examples:");
  console.log("  - Our database connections are maxed out, what do I do?");
  console.log("  - Redis memory is at 95%, what are the steps?");
  console.log("  - API is returning 503 errors");
  console.log("  - A pod keeps crashing in Kubernetes");
  console.log('\nType "exit" to quit.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question("Engineer: ", async (input) => {
      const query = input.trim();

      if (query.toLowerCase() === "exit") {
        console.log("\nGoodbye! Stay on-call.");
        rl.close();
        return;
      }

      if (!query) {
        ask();
        return;
      }

      const validationError = validateQuery(query);
      if (validationError) {
        console.log(`\nAssistant: ${validationError}\n`);
        ask();
        return;
      }

      console.log("\nAssistant: Searching runbooks...\n");
      process.stdout.write("Assistant: ");

      try {
        const stream = await streamWithRetry(chain, query);
        for await (const chunk of stream) {
          process.stdout.write(chunk);
        }
        console.log("\n\n----------------------------------------------\n");
      } catch (err) {
        if (err.message?.includes("API key")) {
          console.error("\nError: Invalid or missing GEMINI_API_KEY. Check your .env file.\n");
        } else if (err.message?.includes("quota") || err.message?.includes("429")) {
          console.error("\nError: Still rate limited after retries. Wait 60s and try again.\n");
        } else {
          console.error(`\nError: ${err.message}\n`);
        }
      }

      ask();
    });
  };

  ask();
}

main();
