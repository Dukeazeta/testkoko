import { createClient, type RedisClientType } from "redis";

const globalForRedis = globalThis as unknown as {
  redisClient?: RedisClientType;
  redisConnecting?: Promise<RedisClientType | null>;
};

function buildRedisClient(url: string): RedisClientType {
  return createClient({
    url,
    socket: {
      connectTimeout: 3_000,
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          return new Error("Redis reconnect retries exceeded");
        }

        return Math.min(250 * 2 ** retries, 5_000);
      },
    },
  });
}

function isRedisRequired(): boolean {
  if (process.env.REQUIRE_REDIS === "true") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

function skipRedisInTest(): boolean {
  return process.env.NODE_ENV === "test" && process.env.USE_REDIS_IN_TEST !== "true";
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (skipRedisInTest()) {
    return null;
  }

  const required = isRedisRequired();
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    if (required) {
      throw new Error("REDIS_URL is required in this environment");
    }

    return null;
  }

  if (globalForRedis.redisClient?.isOpen) {
    return globalForRedis.redisClient;
  }

  if (globalForRedis.redisConnecting) {
    return globalForRedis.redisConnecting;
  }

  const client = globalForRedis.redisClient ?? buildRedisClient(redisUrl);
  globalForRedis.redisClient = client;

  globalForRedis.redisConnecting = client
    .connect()
    .then(() => {
      globalForRedis.redisConnecting = undefined;
      return client;
    })
    .catch((error) => {
      globalForRedis.redisConnecting = undefined;
      if (required) {
        throw error;
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn("Redis unavailable, falling back without cache:", error);
      }

      return null;
    });

  return globalForRedis.redisConnecting;
}

export async function closeRedisClient(): Promise<void> {
  if (globalForRedis.redisConnecting) {
    await globalForRedis.redisConnecting.catch(() => null);
  }

  if (globalForRedis.redisClient?.isOpen) {
    await globalForRedis.redisClient.quit();
  }

  globalForRedis.redisClient = undefined;
  globalForRedis.redisConnecting = undefined;
}
