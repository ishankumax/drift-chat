// In-memory Redis mock for development (when real Redis is not available)

class InMemoryRedis {
  constructor() {
    this.data = new Map(); // string keys -> values
    this.hashes = new Map(); // hash keys -> Map of field -> value
    this.sets = new Map(); // set keys -> Set of members
  }

  async set(key, value) {
    this.data.set(key, String(value));
    return 'OK';
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async del(...keys) {
    let count = 0;
    keys.forEach(key => {
      if (this.data.delete(key)) count++;
      if (this.hashes.delete(key)) count++;
      if (this.sets.delete(key)) count++;
    });
    return count;
  }

  async hset(key, ...args) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }

    const hash = this.hashes.get(key);
    let count = 0;

    // Handle both object and field/value pairs
    if (args.length === 1 && typeof args[0] === 'object') {
      const obj = args[0];
      for (const [field, value] of Object.entries(obj)) {
        if (!hash.has(field)) count++;
        hash.set(field, String(value));
      }
    } else {
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i];
        const value = args[i + 1];
        if (!hash.has(field)) count++;
        hash.set(field, String(value));
      }
    }

    return count;
  }

  async hgetall(key) {
    const hash = this.hashes.get(key);
    if (!hash) return {};

    const result = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    return result;
  }

  async hget(key, field) {
    const hash = this.hashes.get(key);
    return hash ? hash.get(field) || null : null;
  }

  async hincrby(key, field, increment) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key);
    const current = parseInt(hash.get(field) || '0', 10);
    const newValue = current + increment;
    hash.set(field, String(newValue));
    return newValue;
  }

  async sadd(key, ...members) {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key);
    let count = 0;
    members.forEach(member => {
      if (!set.has(member)) {
        set.add(member);
        count++;
      }
    });
    return count;
  }

  async sismember(key, member) {
    const set = this.sets.get(key);
    return set && set.has(member) ? 1 : 0;
  }

  async srem(key, ...members) {
    const set = this.sets.get(key);
    if (!set) return 0;
    let count = 0;
    members.forEach(member => {
      if (set.delete(member)) count++;
    });
    return count;
  }

  async smembers(key) {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async expire(key, seconds) {
    // Simplified: just mark it as valid, don't actually expire
    return 1;
  }

  async scan(cursor, matchType, pattern) {
    // Simple scan implementation
    const results = [];
    if (matchType === 'MATCH') {
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.hashes.keys()) {
        if (regex.test(key)) {
          results.push(key);
        }
      }
    }
    return [0, results];
  }

  on(event, callback) {
    // No-op for mock
  }

  async quit() {
    return 'OK';
  }
}

module.exports = InMemoryRedis;

