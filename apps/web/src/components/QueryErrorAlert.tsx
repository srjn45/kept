export interface QueryErrorAlertProps {
  message: string
  onRetry: () => void
  retryLabel?: string
}

export function QueryErrorAlert({ message, onRetry, retryLabel = 'Retry' }: QueryErrorAlertProps) {
  return (
    <div className="rounded-md bg-red-50 p-4 text-sm text-red-800" role="alert">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded border border-red-300 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
        >
          {retryLabel}
        </button>
      </div>
    </div>
  )
}
