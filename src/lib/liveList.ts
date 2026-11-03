type Listener<T> = (value: T[]) => void;

/** One shared subscription that exists only while its consumers are mounted. */
export function createLiveList<T>(
  authenticate: () => Promise<unknown>,
  connect: (receive: Listener<T>, failed: () => void) => () => void,
) {
  const listeners = new Set<Listener<T>>();
  let latest: T[] = [];
  let stop: (() => void) | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let running = false;
  const publish = (value: T[]) => {
    latest = value;
    listeners.forEach((listener) => listener(value));
  };
  const start = () => {
    if (running || !listeners.size) return;
    running = true;
    const current = ++generation;
    const failed = () => {
      if (current !== generation) return;
      generation++;
      running = false;
      stop?.();
      stop = undefined;
      publish([]);
      if (listeners.size) retry = setTimeout(start, 3000);
    };
    void authenticate().then(() => {
      if (current !== generation || !listeners.size) return;
      const unsubscribe = connect((value) => {
        if (current === generation) publish(value);
      }, failed);
      if (current === generation) stop = unsubscribe;
      else unsubscribe();
    }).catch(failed);
  };
  return {
    get: () => latest,
    replace: publish,
    subscribe(listener: Listener<T>): () => void {
      listeners.add(listener);
      listener(latest);
      start();
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        generation++;
        running = false;
        clearTimeout(retry);
        stop?.();
        stop = undefined;
        latest = [];
      };
    },
  };
}
