import { type Functions, type HttpsCallable, type HttpsCallableOptions, httpsCallable as sdkHttpsCallable } from 'firebase/functions'

/** What the SDK puts after a server's message: the HTTP status, " [409]". */
const STATUS = /\s\[\d{3}\]$/

/** An error from a Cloud Function with its message as the server wrote it, without the SDK's status code. */
export function withoutStatus<E>(e: E): E {
  if (e instanceof Error && STATUS.test(e.message)) e.message = e.message.replace(STATUS, '')
  return e
}

/**
 * Firebase's `httpsCallable`, for every Cloud Function the website calls. The SDK (12.x) ends each error's message with
 * the HTTP status ("That PIN is already in use. Choose a different one. [409]"), and the website shows the server's
 * messages to people as they are: this takes the status off. Everything else is the SDK's.
 */
export function httpsCallable<RequestData = unknown, ResponseData = unknown, StreamData = unknown>(
  functions: Functions,
  name: string,
  options?: HttpsCallableOptions,
): HttpsCallable<RequestData, ResponseData, StreamData> {
  const fn = sdkHttpsCallable<RequestData, ResponseData, StreamData>(functions, name, options)
  const call = (data?: RequestData | null) => fn(data).catch((e: unknown) => Promise.reject(withoutStatus(e)))
  return Object.assign(call, { stream: fn.stream })
}
