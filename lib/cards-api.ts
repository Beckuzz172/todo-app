import { z } from "zod";

const cookieName = "kanban_board";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const cardInput = z.object({
  title: z.string().trim().min(1, "Enter a card title.").max(160),
  description: z.string().max(2000).default(""),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
}).strict();
export const cardPatch = cardInput.partial().refine((value) => Object.keys(value).length > 0, "No changes provided.");

export function boardSession(request: Request) {
  const raw = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const existing = raw && uuid.test(raw) ? raw : null;
  const boardId = existing ?? crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { boardId, cookie: `${cookieName}=${boardId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}` };
}

export function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  }});
}

export function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  }
  return null;
}

export async function parseBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("Send application/json.");
  const body = await request.text();
  if (body.length > 12000) throw new Error("Request is too large.");
  let data;
  try { data = JSON.parse(body); } catch { throw new Error("Invalid JSON."); }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid card.");
  return parsed.data;
}

export function publicCard<T extends { boardId: string }>(card: T) {
  const { boardId: _boardId, ...result } = card;
  return result;
}

export function serverError(error: unknown) {
  console.error("Card storage request failed", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "Could not reach the database. Please try again." }, 503);
}
