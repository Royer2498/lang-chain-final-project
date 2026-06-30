import "dotenv/config";
import fs from "fs/promises";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { config } from "./config.js";
import { loadAndSplitDocuments } from "./loaders/documentLoader.js";
import { createVectorStore } from "./stores/vectorStore.js";
import { createCompressedRetriever } from "./retrievers/compressedRetriever.js";
import { createRagChain } from "./chains/ragChain.js";

const TEST_CASES = [
  {
    id: 1,
    query: "Our database connections are maxed out, what do I do?",
    mustContain: ["connection", "pool"],
  },
  {
    id: 2,
    query: "Redis memory is at 95%, what are the steps?",
    mustContain: ["maxmemory", "eviction"],
  },
  {
    id: 3,
    query: "A pod keeps crashing in Kubernetes",
    mustContain: ["CrashLoop", "logs"],
  },
  {
    id: 4,
    query: "API is returning 503 errors",
    mustContain: ["upstream", "health"],
  },
  {
    id: 5,
    query: "How do I fix a unicorn?",
    mustContain: ["escalate"],
  },
];

async function buildChain() {
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

async function runEval() {
  if (!config.geminiApiKey) {
    console.error("ERROR: GEMINI_API_KEY is not set in your .env file.");
    process.exit(1);
  }

  const lines = [
    "EVALUATION LOG — Incident Response RAG Assistant",
    `Model: ${config.geminiModel} | Embeddings: ${config.geminiEmbeddingModel}`,
    `Similarity threshold: ${config.similarityThreshold} | K: ${config.retrieverK}`,
    `Run date: ${new Date().toISOString()}`,
    "=".repeat(60),
    "",
  ];

  console.log("Initializing chain...\n");
  const chain = await buildChain();

  let passed = 0;

  for (const tc of TEST_CASES) {
    console.log(`[${tc.id}/${TEST_CASES.length}] ${tc.query}`);
    lines.push(`QUERY ${tc.id}: ${tc.query}`);
    lines.push("-".repeat(40));

    let response = "";
    try {
      const stream = await chain.stream(tc.query);
      for await (const chunk of stream) {
        process.stdout.write(chunk);
        response += chunk;
      }
      console.log("\n");

      const ok = tc.mustContain.every((kw) =>
        response.toLowerCase().includes(kw.toLowerCase())
      );
      if (ok) passed++;

      lines.push(`RESPONSE:\n${response}`);
      lines.push(`VERDICT: ${ok ? "PASS" : "PARTIAL"} (checked for: ${tc.mustContain.join(", ")})`);
    } catch (err) {
      console.error(`Error: ${err.message}\n`);
      lines.push(`ERROR: ${err.message}`);
      lines.push("VERDICT: ERROR");
    }

    lines.push("");
  }

  lines.push("=".repeat(60));
  lines.push(`FINAL: ${passed}/${TEST_CASES.length} passed`);

  await fs.writeFile("eval-results.txt", lines.join("\n"), "utf-8");
  console.log(`\nEvaluation complete: ${passed}/${TEST_CASES.length} passed.`);
  console.log("Results saved to eval-results.txt");
}

runEval().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
