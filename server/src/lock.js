let queue = Promise.resolve()

/** Una sola cola para usuarios y pedidos, para que las escrituras no se pisen. */
export function locked(task) {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
