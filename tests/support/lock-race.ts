import type postgres from 'postgres';

/**
 * Deterministic interleaving of a write with a competing committed change: a session holds a row lock and makes the
 * change, the write under test starts and queues behind the lock, and only then does the session commit.
 */
export function createLockRace(owner: postgres.Sql, probe: postgres.Sql) {
  /** Polls the server for a statement of the write queued behind the lock instead of guessing with sleeps. */
  async function waitForLockWait(statement: string) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const waiting = await probe`select 1 from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and state = 'active' and query ilike ${`%${statement}%`}`;
      if (waiting.length > 0) return;
      if (Date.now() > deadline)
        throw new Error('The write never queued behind the lock');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** `lock` takes the row lock inside the session, `change` runs next, and `write` starts once the session holds the lock. */
  return async function raceWithLock<T>(
    lock: (tx: postgres.TransactionSql) => Promise<unknown>,
    change: (tx: postgres.TransactionSql) => Promise<void>,
    write: () => Promise<T>,
    waitsOn: 'for share' | 'for update' = 'for share',
  ): Promise<T> {
    let locked: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = owner.begin(async (tx) => {
      await lock(tx);
      await change(tx);
      locked();
      await held;
    });
    await holding;
    const writing = write();
    await waitForLockWait(waitsOn);
    release();
    await session;
    return writing;
  };
}
