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
      reconnectStrategy: false,
    },
  });
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
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
      if (process.env.NODE_ENV !== "production") {
        console.warn("Redis unavailable, falling back without cache:", error);
      }
      return null;
    });

  return globalForRedis.redisConnecting;
}
