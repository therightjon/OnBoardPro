#!/usr/bin/env tsx
import 'dotenv/config';
import { db } from "../server/db/connection";
import { notifications } from "@shared/schema";

async function checkNotifications() {
  const result = await db.select().from(notifications);
  console.log('Remaining notifications:', result.length);
  result.forEach(n => console.log({ id: n.id, type: n.type, entityType: n.entityType, entityId: n.entityId }));
  
  if (result.length > 0) {
    console.log('\nDeleting all remaining notifications...');
    const deleted = await db.delete(notifications).returning({ id: notifications.id });
    console.log(`Deleted ${deleted.length} notifications`);
  }
  
  process.exit(0);
}

checkNotifications();
