import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";

const SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) assistant helping engineers respond to production incidents.

Use ONLY the following runbooks and postmortems to answer the question.
Be specific, step-by-step, and actionable.
If the provided context does not contain enough information to answer, say:
"I don't have a runbook for this specific issue. Please escalate to the on-call engineer."

Context from runbooks and postmortems:
{context}

Engineer's question: {question}

Your answer:`;

const formatDocs = (docs) => docs.map((d) => d.pageContent).join("\n\n---\n\n");

export function createRagChain(retriever, llm) {
  const prompt = ChatPromptTemplate.fromTemplate(SYSTEM_PROMPT);

  return RunnableSequence.from([
    {
      context: retriever.pipe(formatDocs),
      question: new RunnablePassthrough(),
    },
    prompt,
    llm,
    new StringOutputParser(),
  ]);
}
