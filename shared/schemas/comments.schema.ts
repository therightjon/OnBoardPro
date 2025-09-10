import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth.schema";

export const commentEntityEnum = pgEnum("comment_entity", ["candidate", "task"]);
export const commentVisibilityEnum = pgEnum("comment_visibility", ["internal", "external"]);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    entityType: commentEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    visibility: commentVisibilityEnum("visibility").notNull(),
    parentId: uuid("parent_id"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    entityVisibilityIdx: index("comments_entity_visibility_idx").on(t.entityType, t.entityId, t.visibility, t.createdAt),
  })
);

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(users, {
    fields: [comments.authorUserId],
    references: [users.id],
  }),
}));

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

