export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const fixedClock = (instant: Date): Clock => ({
  now: () => new Date(instant.getTime()),
});
