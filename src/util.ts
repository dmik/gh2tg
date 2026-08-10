type TryCatchFailureResult <Fallback_> =
  Fallback_ extends (error_: unknown) => infer Result_ ? Result_ : Fallback_;


/**
 * Calls a function with the given arguments in a try-catch block and returns its value, or a
 * given "on-failure" result if an exception occurs.
 *
 * The last argument specifies the "on-failure" result and is not passed to the called function. If
 * the argument list is empty, the "on-failure" result is set to `undefined`.
 *
 * Note that the "on-failure" value may be a function. In this case, if an exception occurs, it will
 * be called with the exception object passed as an argument and the value it returns will be
 * used as the "on-failure" result.
 *
 * The main purpose of this function is to act as a one-liner when it is only necessary to catch an
 * exception in a single call.
 *
 * @param func_ Function to call.
 * @param args_ Arguments to the function plus an "on-failure" result.
 * @returns Function return value or "on-failure".
 */

export function tryCatch <Result_> (func_: () => Result_): Result_ | undefined;

export function tryCatch <Args_ extends unknown [], Result_, Fallback_>
(
  func_: (...args_: Args_) => Result_,
  ...args_: [ ...Args_, Fallback_ ]
): Result_ | TryCatchFailureResult <Fallback_>;

export function tryCatch (func_: CallableFunction, ...args_: unknown []): unknown
{
  const onFailure = args_.pop ();

  try
  {
    return Reflect.apply (func_, undefined, args_);
  }
  catch (error)
  {
    return typeof onFailure === 'function'
      ? Reflect.apply (onFailure, undefined, [ error ])
      : onFailure;
  }
}
