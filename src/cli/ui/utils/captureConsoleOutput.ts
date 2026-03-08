import { format } from "node:util"

export async function captureConsoleOutput<T>(
  task: () => Promise<T>
): Promise<T> {
  const originalLog = console.log
  const originalError = console.error

  console.log = (...args: unknown[]) => {
    void format(...args)
  }
  console.error = (...args: unknown[]) => {
    void format(...args)
  }

  try {
    return await task()
  } finally {
    console.log = originalLog
    console.error = originalError
  }
}
