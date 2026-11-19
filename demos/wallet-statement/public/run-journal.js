// Two independent reports can be larger than localStorage's shared quota.
// Await transaction completion before forwarding any signed payment.
export async function openRunJournal() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("testril-pool-flows", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("runs", { keyPath: "method" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Browser storage is blocked."));
  });
  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("runs", mode, { durability: "strict" });
      let value, failure;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () =>
        reject(failure ?? tx.error ?? new Error("Run could not be saved."));
      operation(
        tx.objectStore("runs"),
        (result) => {
          value = result;
        },
        (error) => {
          failure = error;
          tx.abort();
        },
      );
    });
  }
  return {
    load: () =>
      transaction("readonly", (store, done) => {
        const request = store.getAll();
        request.onsuccess = () => done(request.result);
      }),
    save: (run) =>
      transaction("readwrite", (store, done, stop) => {
        const request = store.getAll();
        request.onsuccess = () => {
          if (
            request.result.some((saved) => saved.pending && saved.id !== run.id)
          ) {
            stop(new Error("An unresolved purchase must be checked first."));
            return;
          }
          try {
            store.put(structuredClone(run));
            done();
          } catch (error) {
            stop(error);
          }
        };
      }),
    close: () => db.close(),
  };
}
