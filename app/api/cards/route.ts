import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cards } from "@/db/schema";
import { boardSession, cardInput, json, parseBody, publicCard, serverError, validateOrigin } from "@/lib/cards-api";

export async function GET(request: Request) {
  const session = boardSession(request);
  try {
    const results = await getDb().select().from(cards).where(eq(cards.boardId, session.boardId)).orderBy(asc(cards.created_at), asc(cards.id));
    return json({ cards: results.map(publicCard) }, 200, session.cookie);
  } catch (error) { return serverError(error); }
}

export async function POST(request: Request) {
  const rejected = validateOrigin(request);
  if (rejected) return rejected;
  let input;
  try { input = await parseBody(request, cardInput); }
  catch (error) { return json({ error: (error as Error).message }, 400); }
  const session = boardSession(request);
  const now = new Date().toISOString();
  try {
    const [card] = await getDb().insert(cards).values({ ...input, id: crypto.randomUUID(), boardId: session.boardId, created_at: now, updated_at: now }).returning();
    return json({ card: publicCard(card) }, 201, session.cookie);
  } catch (error) { return serverError(error); }
}
