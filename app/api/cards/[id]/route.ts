import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cards } from "@/db/schema";
import { boardSession, cardPatch, json, parseBody, publicCard, serverError, validateOrigin } from "@/lib/cards-api";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const rejected = validateOrigin(request);
  if (rejected) return rejected;
  let input;
  try { input = await parseBody(request, cardPatch); }
  catch (error) { return json({ error: (error as Error).message }, 400); }
  const { id } = await context.params;
  const session = boardSession(request);
  try {
    const [card] = await getDb().update(cards).set({ ...input, updated_at: new Date().toISOString() })
      .where(and(eq(cards.id, id), eq(cards.boardId, session.boardId))).returning();
    return card ? json({ card: publicCard(card) }, 200, session.cookie) : json({ error: "Card not found." }, 404);
  } catch (error) { return serverError(error); }
}

export async function DELETE(request: Request, context: Context) {
  const rejected = validateOrigin(request);
  if (rejected) return rejected;
  const { id } = await context.params;
  const session = boardSession(request);
  try {
    const deleted = await getDb().delete(cards).where(and(eq(cards.id, id), eq(cards.boardId, session.boardId))).returning({ id: cards.id });
    return deleted.length ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : json({ error: "Card not found." }, 404);
  } catch (error) { return serverError(error); }
}
