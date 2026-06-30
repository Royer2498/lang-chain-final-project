import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = path.join(__dirname, "../data");

export async function loadAndSplitDocuments(dataPath = DEFAULT_DATA_PATH) {
  const files = await fs.readdir(dataPath);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  const rawDocs = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await fs.readFile(path.join(dataPath, file), "utf-8");
      return new Document({ pageContent: content, metadata: { source: file } });
    })
  );

  console.log(`Loaded ${rawDocs.length} documents.`);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
  });

  const docs = await splitter.splitDocuments(rawDocs);
  console.log(`Split into ${docs.length} chunks.`);
  return docs;
}
