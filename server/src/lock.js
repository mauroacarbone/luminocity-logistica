import { withTransaction } from './db/store.js'

let queue = Promise.resolve()

/** Una sola cola para que las escrituras no se pisen. En Postgres, cada una es una transacción. */
export function locked(task) {
  const run = queue.then(
    () => withTransaction(task),
    () => withTransaction(task),
  )
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
