import { useEffect, useState } from 'react'

interface ShareButtonProps {
  className?: string
  title: string
  text: string
  /** Defaults to the current page URL. */
  url?: string
  /** Accessible label for the share control. */
  label?: string
}

export function ShareButton({
  className = '',
  title,
  text,
  url,
  label = 'Share this schedule',
}: ShareButtonProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!feedback) return
    const id = window.setTimeout(() => setFeedback(null), 1800)
    return () => window.clearTimeout(id)
  }, [feedback])

  async function shareSite() {
    const shareUrl =
      url ?? (typeof window !== 'undefined' ? window.location.href : '')

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title,
          text,
          url: shareUrl,
        })
        return
      }
    } catch (err) {
      // User canceled the share sheet — don't treat as an error.
      if (err instanceof DOMException && err.name === 'AbortError') return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setFeedback('Link copied')
    } catch {
      setFeedback('Could not copy')
    }
  }

  return (
    <div className={`share${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="share__button"
        aria-label={label}
        title="Share"
        onClick={(event) => {
          event.stopPropagation()
          void shareSite()
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="share__icon"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.59 13.51 6.83 3.98" />
          <path d="m15.41 6.51-6.82 3.98" />
        </svg>
      </button>
      {feedback ? (
        <span className="share__toast" role="status" aria-live="polite">
          {feedback}
        </span>
      ) : null}
    </div>
  )
}
