import { InMemoryStorage } from "./inMemoryStorage";
import { resetStorage, setStorage } from "../../db/storage";

export interface AuthTestEnvironment {
  storage: InMemoryStorage;
  dispose(): Promise<void>;
  useAsGlobalStorage(): () => void;
}

export async function createAuthTestEnvironment(): Promise<AuthTestEnvironment> {
  const storage = new InMemoryStorage();

  const useAsGlobalStorage = () => {
    setStorage(storage as any);
    return () => resetStorage();
  };

  const dispose = async () => {
    storage.reset();
  };

  return {
    storage,
    dispose,
    useAsGlobalStorage
  };
}
