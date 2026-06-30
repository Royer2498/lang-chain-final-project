import fs from "fs/promises";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), ".embeddings-cache.json");

async function loadCache(cacheKey) {
  try {
    const data = JSON.parse(await fs.readFile(CACHE_FILE, "utf-8"));
    if (data.cacheKey === cacheKey) return data.items;
  } catch {
    // no cache or parse error
  }
  return null;
}

async function saveCache(cacheKey, items) {
  const serializable = items.map(({ doc, embedding }) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata,
    embedding,
  }));
  await fs.writeFile(CACHE_FILE, JSON.stringify({ cacheKey, items: serializable }));
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

export async function createVectorStore(docs, embeddings) {
  const cacheKey = docs.reduce((sum, d) => sum + d.pageContent.length, 0);

  let items;
  const cached = await loadCache(cacheKey);

  if (cached) {
    console.log(`Loaded ${cached.length} embeddings from cache.`);
    items = cached.map(({ pageContent, metadata, embedding }) => ({
      doc: { pageContent, metadata },
      embedding,
    }));
  } else {
    console.log("Computing embeddings (first run — this will be cached)...");
    const texts = docs.map((d) => d.pageContent);
    const docEmbeddings = await embeddings.embedDocuments(texts);
    items = docs.map((doc, i) => ({ doc, embedding: docEmbeddings[i] }));
    await saveCache(cacheKey, items);
    console.log("Embeddings saved to cache.");
  }

  console.log("Vector store ready.");

  return {
    async search(queryEmbedding) {
      return items
        .map((item) => ({ doc: item.doc, score: cosineSimilarity(queryEmbedding, item.embedding) }))
        .sort((a, b) => b.score - a.score);
    },
  };
}
