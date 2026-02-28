// src/db/redis.js
import Redis from "ioredis";

let redis = null;

export function getRedis() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set");
    return null;
  }

  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on("connect", () => {
      console.log("REDIS_CONNECTED");
    });

    redis.on("error", (err) => {
      console.error("REDIS_ERROR", err.message);
    });
  }

  return redis;
}