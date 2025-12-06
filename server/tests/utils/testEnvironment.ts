/**
 * Test Environment Utilities
 * 
 * Provides test infrastructure for both legacy storage-based tests
 * and new service factory-based tests.
 */

import { MockServiceFactory, setServiceFactoryForTesting, resetServiceFactory } from "./mockServiceFactory";

/**
 * Test environment interface
 */
export interface TestEnvironment {
  /** The mock service factory for seeding test data */
  mockFactory: MockServiceFactory;
  /** Clean up resources */
  dispose(): Promise<void>;
  /** Activate the mock service factory for route testing */
  activate(): () => void;
}

/**
 * Create a test environment with mock services
 * 
 * Usage:
 *   const env = await createTestEnvironment();
 *   const cleanup = env.activate();
 *   env.mockFactory.upsertUser({ id: '1', username: 'admin', ... });
 *   // ... run tests ...
 *   cleanup();
 *   await env.dispose();
 */
export async function createTestEnvironment(): Promise<TestEnvironment> {
  const mockFactory = new MockServiceFactory();

  const activate = () => {
    setServiceFactoryForTesting(mockFactory);
    return () => resetServiceFactory();
  };

  const dispose = async () => {
    mockFactory.reset();
    resetServiceFactory();
  };

  return {
    mockFactory,
    dispose,
    activate
  };
}

/**
 * @deprecated Use createTestEnvironment() instead.
 * Legacy support for tests still using InMemoryStorage pattern.
 */
export interface AuthTestEnvironment {
  storage: MockServiceFactory;
  dispose(): Promise<void>;
  useAsGlobalStorage(): () => void;
}

/**
 * @deprecated Use createTestEnvironment() instead.
 * Legacy compatibility wrapper - maps old API to new MockServiceFactory.
 */
export async function createAuthTestEnvironment(): Promise<AuthTestEnvironment> {
  const mockFactory = new MockServiceFactory();

  const useAsGlobalStorage = () => {
    setServiceFactoryForTesting(mockFactory);
    return () => resetServiceFactory();
  };

  const dispose = async () => {
    mockFactory.reset();
    resetServiceFactory();
  };

  return {
    storage: mockFactory,
    dispose,
    useAsGlobalStorage
  };
}
