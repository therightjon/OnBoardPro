/**
 * Event Bus
 *
 * Central event dispatcher for the domain events system.
 * Implements publish/subscribe pattern with middleware support.
 */

import { randomUUID } from "node:crypto";
import type {
  DomainEvent,
  EventHandler,
  EventMiddleware,
  EventType,
  AnyDomainEvent
} from "./event-types";

/**
 * Event subscription
 */
interface EventSubscription {
  id: string;
  eventType: EventType | "*";
  handler: EventHandler;
  priority: number;
}

/**
 * Event bus options
 */
export interface EventBusOptions {
  /** Whether to process events asynchronously (default: true) */
  async?: boolean;
  /** Maximum concurrent event handlers (default: 10) */
  concurrency?: number;
  /** Whether to log errors (default: true) */
  logErrors?: boolean;
  /** Whether to rethrow errors after logging (default: false) */
  throwErrors?: boolean;
}

/**
 * Event bus for publishing and subscribing to domain events
 */
export class EventBus {
  private subscriptions: Map<EventType | "*", EventSubscription[]>;
  private middleware: EventMiddleware[];
  private options: Required<EventBusOptions>;
  private processing: number = 0;

  constructor(options: EventBusOptions = {}) {
    this.subscriptions = new Map();
    this.middleware = [];
    this.options = {
      async: options.async ?? true,
      concurrency: options.concurrency ?? 10,
      logErrors: options.logErrors ?? true,
      throwErrors: options.throwErrors ?? false
    };
  }

  /**
   * Register middleware to run for all events
   * Middleware runs in the order it was registered
   *
   * @param middleware - Middleware function
   */
  use(middleware: EventMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Subscribe to an event type
   *
   * @param eventType - Event type to subscribe to (or "*" for all events)
   * @param handler - Handler function to call when event is published
   * @param priority - Priority for handler execution (higher = earlier, default: 0)
   * @returns Unsubscribe function
   */
  on<T extends AnyDomainEvent>(
    eventType: T["type"] | "*",
    handler: EventHandler<T>,
    priority: number = 0
  ): () => void {
    const subscription: EventSubscription = {
      id: randomUUID(),
      eventType,
      handler: handler as EventHandler,
      priority
    };

    const existing = this.subscriptions.get(eventType) || [];
    existing.push(subscription);

    // Sort by priority (descending)
    existing.sort((a, b) => b.priority - a.priority);

    this.subscriptions.set(eventType, existing);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(eventType);
      if (subs) {
        const filtered = subs.filter(s => s.id !== subscription.id);
        if (filtered.length > 0) {
          this.subscriptions.set(eventType, filtered);
        } else {
          this.subscriptions.delete(eventType);
        }
      }
    };
  }

  /**
   * Subscribe to an event type once (auto-unsubscribes after first call)
   *
   * @param eventType - Event type to subscribe to
   * @param handler - Handler function to call when event is published
   * @param priority - Priority for handler execution (higher = earlier, default: 0)
   */
  once<T extends AnyDomainEvent>(
    eventType: T["type"],
    handler: EventHandler<T>,
    priority: number = 0
  ): void {
    const unsubscribe = this.on(
      eventType,
      async (event) => {
        unsubscribe();
        await handler(event as T);
      },
      priority
    );
  }

  /**
   * Publish an event to all subscribers
   *
   * @param event - Domain event to publish
   * @returns Promise that resolves when all handlers have processed the event
   */
  async publish<T extends AnyDomainEvent>(event: T): Promise<void> {
    if (this.options.async) {
      // Async: Don't wait for handlers, respect concurrency limit
      this.publishAsync(event).catch(error => {
        if (this.options.logErrors) {
          console.error("Error in async event handlers:", error);
        }
      });
    } else {
      // Sync: Wait for all handlers to complete
      await this.publishSync(event);
    }
  }

  /**
   * Publish event synchronously (wait for all handlers)
   */
  private async publishSync<T extends AnyDomainEvent>(event: T): Promise<void> {
    // Run middleware chain
    await this.runMiddleware(event, async () => {
      // Get handlers for this specific event type and wildcard handlers
      const specificHandlers = this.subscriptions.get(event.type) || [];
      const wildcardHandlers = this.subscriptions.get("*") || [];
      const allHandlers = [...specificHandlers, ...wildcardHandlers];

      // Sort by priority
      allHandlers.sort((a, b) => b.priority - a.priority);

      // Execute all handlers sequentially
      for (const subscription of allHandlers) {
        try {
          await subscription.handler(event);
        } catch (error) {
          await this.handleError(error, event, subscription);
        }
      }
    });
  }

  /**
   * Publish event asynchronously (don't wait for handlers)
   */
  private async publishAsync<T extends AnyDomainEvent>(event: T): Promise<void> {
    // Run middleware chain
    await this.runMiddleware(event, async () => {
      // Get handlers
      const specificHandlers = this.subscriptions.get(event.type) || [];
      const wildcardHandlers = this.subscriptions.get("*") || [];
      const allHandlers = [...specificHandlers, ...wildcardHandlers];

      // Sort by priority
      allHandlers.sort((a, b) => b.priority - a.priority);

      // Execute handlers with concurrency limit
      const promises = allHandlers.map(subscription =>
        this.executeWithConcurrencyLimit(async () => {
          try {
            await subscription.handler(event);
          } catch (error) {
            await this.handleError(error, event, subscription);
          }
        })
      );

      await Promise.all(promises);
    });
  }

  /**
   * Execute function with concurrency limit
   */
  private async executeWithConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
    // Wait if at concurrency limit
    while (this.processing >= this.options.concurrency) {
      await new Promise(resolve => setImmediate(resolve));
    }

    this.processing++;
    try {
      return await fn();
    } finally {
      this.processing--;
    }
  }

  /**
   * Run middleware chain
   */
  private async runMiddleware(event: DomainEvent, finalHandler: () => Promise<void>): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(event, next);
      } else {
        await finalHandler();
      }
    };

    await next();
  }

  /**
   * Handle error from event handler
   */
  private async handleError(
    error: unknown,
    event: DomainEvent,
    subscription: EventSubscription
  ): Promise<void> {
    if (this.options.logErrors) {
      console.error("Error in event handler:", {
        error,
        eventType: event.type,
        eventId: event.id,
        subscriptionId: subscription.id,
        timestamp: event.timestamp
      });
    }

    if (this.options.throwErrors) {
      throw error;
    }
  }

  /**
   * Get number of subscribers for an event type
   */
  getSubscriberCount(eventType: EventType | "*"): number {
    return (this.subscriptions.get(eventType) || []).length;
  }

  /**
   * Get total number of subscriptions
   */
  getTotalSubscriptions(): number {
    let total = 0;
    for (const subs of this.subscriptions.values()) {
      total += subs.length;
    }
    return total;
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
  }

  /**
   * Get current processing count (for async mode)
   */
  getProcessingCount(): number {
    return this.processing;
  }

  /**
   * Wait for all async handlers to complete
   * Useful for testing or graceful shutdown
   */
  async waitForPending(timeoutMs: number = 5000): Promise<void> {
    const start = Date.now();
    while (this.processing > 0) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for event handlers (${this.processing} still processing)`);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

// Export singleton instance
export const eventBus = new EventBus({
  async: true,
  concurrency: 10,
  logErrors: true,
  throwErrors: false
});
