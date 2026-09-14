/** The current time, injected so tests can fix it (`fixedClock`) and stamps are checkable. */
export interface Clock {
  now(): Date;
}
