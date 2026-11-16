/** Lo que debe cerrarse con el botón "atrás" del teléfono, en orden: lo último abierto se cierra primero. */
const stack: (() => void)[] = []

export function pushBack(close: () => void): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Cierra lo último abierto. Devuelve false si no había nada que cerrar. */
export function handleBack(): boolean {
  const close = stack.at(-1)
  if (!close) return false
  close()
  return true
}
