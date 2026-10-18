import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  boardId: text("board_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
}, (table) => [
  index("cards_board_created_idx").on(table.boardId, table.created_at),
  check("cards_status_check", sql`${table.status} IN ('todo', 'doing', 'done')`),
  check("cards_priority_check", sql`${table.priority} IN ('low', 'medium', 'high')`),
]);
