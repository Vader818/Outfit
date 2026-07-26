export type ExclusiveActionLock<Action> = {
  current(): Action | null;
  tryAcquire(action: Action): boolean;
  release(action: Action): boolean;
};

export function createExclusiveActionLock<Action>(): ExclusiveActionLock<Action> {
  let currentAction: Action | null = null;

  return {
    current() {
      return currentAction;
    },
    tryAcquire(action) {
      if (currentAction !== null) return false;
      currentAction = action;
      return true;
    },
    release(action) {
      if (currentAction !== action) return false;
      currentAction = null;
      return true;
    }
  };
}
