# Incident Response RAG Assistant

An AI-powered assistant that helps Site Reliability Engineers (SREs) respond to production incidents. It searches a knowledge base of runbooks and postmortems using Retrieval-Augmented Generation (RAG) to deliver precise, actionable answers in seconds.

## The Problem It Solves

During a P1 incident, engineers waste 10-20 minutes searching through wikis and Confluence pages to find the right runbook. This system reduces that to a single natural-language query, cutting mean time to resolution (MTTR).

## Architecture

```
User Query
    |
    v
Input Validation (length limit + injection guard)
    |
    v
GoogleGenerativeAIEmbeddings (gemini-embedding-001)
    |
    v
Custom In-Memory Vector Store — cosine similarity search (all chunks)
    |
    v
CompressedRetriever
  └─ Similarity threshold filter (>= 0.68)
  └─ Top-K selection (k=5)
    |
    v
ChatPromptTemplate (SRE system prompt)
    |
    v
ChatGoogleGenerativeAI (gemini-2.5-flash, temp=0.2)
    |
    v
StringOutputParser
    |
    v
Final Answer (streamed)
```

**Advanced optimization:** Contextual Compression via similarity threshold — chunks with cosine similarity below 0.68 are dropped before reaching the LLM, reducing token usage and eliminating noise from partially-relevant chunks.

**Embedding cache:** On first run, all document embeddings are computed and saved to `.embeddings-cache.json`. Subsequent runs load from cache instantly, eliminating startup API calls.

## Tech Stack

- **LangChain.js** v1.x with LCEL pipeline
- **Google Gemini 2.5 Flash** (LLM) + **gemini-embedding-001** (embeddings)
- **Custom cosine similarity vector store** (no external dependency)
- **LangSmith** (optional — automatic tracing via env vars)

## Prerequisites

- Node.js 18+
- A Google Gemini API key (https://aistudio.google.com/app/apikey)

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` and add your keys:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

To enable LangSmith tracing (recommended — traces appear at smith.langchain.com):

```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_key_here
LANGCHAIN_PROJECT=incident-rag-assistant
```

**3. Run**

```bash
npm start
```

The first run computes and caches embeddings (~10s). Every subsequent run loads from cache and is ready immediately.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the interactive CLI |
| `npm run eval` | Run 5 automated test queries and save results to `eval-results.txt` |

## Example Queries

Once running, try asking:

- `Our database connections are maxed out, what do I do?`
- `Redis memory is at 95%, what are the steps?`
- `API is returning 503 errors`
- `A pod keeps crashing in Kubernetes`

Type `exit` to quit.

## Knowledge Base

The assistant is pre-loaded with:

| File | Type | Covers |
|---|---|---|
| `runbook-api-high-latency.md` | Runbook | API latency diagnosis |
| `runbook-database-connection-pool.md` | Runbook | DB connection exhaustion |
| `runbook-pod-crash-loop.md` | Runbook | Kubernetes CrashLoopBackOff |
| `runbook-redis-high-memory.md` | Runbook | Redis memory pressure |
| `postmortem-2024-03-15-database-outage.md` | Postmortem | DB connection pool P1 (47 min) |
| `postmortem-2024-06-10-api-503.md` | Postmortem | API Gateway 503 P1 (31 min) |

## Production Readiness Notes

- **Monitoring:** Set LangSmith env vars — every chain call is traced automatically with latency, token counts, and full inputs/outputs.
- **Cost control:** `gemini-2.5-flash` with similarity threshold compression reduces tokens sent to the LLM per query. Embedding cache eliminates repeated API calls at startup.
- **Security:** Queries are validated for length (max 500 chars) and screened for prompt injection patterns before reaching the model.
- **Fallback:** When no relevant context is found, the system explicitly tells the engineer to escalate rather than hallucinating an answer.
- **Scaling to production:** Replace the custom in-memory store with Pinecone or pgvector, and wrap the chain in an Express API endpoint. The `compressedRetriever.js` module does not need to change.
