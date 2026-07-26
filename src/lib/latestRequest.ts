export interface LatestRequestToken {
  isCurrent(): boolean;
}

export interface LatestRequestGate {
  begin(): LatestRequestToken;
  invalidate(): void;
}

export function createLatestRequestGate(): LatestRequestGate {
  let latestVersion = 0;
  return {
    begin() {
      const requestVersion = ++latestVersion;
      return {
        isCurrent: () => requestVersion === latestVersion
      };
    },
    invalidate() {
      latestVersion += 1;
    }
  };
}
