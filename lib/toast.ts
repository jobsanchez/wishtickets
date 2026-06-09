/**
 * No-op toast - all notifications are disabled.
 * Replace "sonner" imports with this module to silence toasts.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop = (..._args: unknown[]) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noopWithId = (..._args: unknown[]) => "";

export const toast = {
  success: noop,
  error: noop,
  info: noop,
  warning: noop,
  message: noop,
  loading: noopWithId,
  dismiss: noop,
  promise: <T>(p: Promise<T>) => p,
  custom: noop,
};
