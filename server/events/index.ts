/**
 * Domain Events System
 *
 * Event-driven architecture for decoupling services and improving observability
 */

export * from "./event-types";
export * from "./EventBus";
export * from "./event-factory";
export * from "./middleware/logging-middleware";
export * from "./handlers/notification-handler";

// Re-export singleton event bus
export { eventBus } from "./EventBus";
