/** Share the current page via Web Share API, with clipboard fallback. */
export async function sharePage(options: {
  title: string
  text: string
  url?: string
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const shareUrl =
    options.url ?? (typeof window !== 'undefined' ? window.location.href : '')

  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({
        title: options.title,
        text: options.text,
        url: shareUrl,
      })
      return 'shared'
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled'
    }
  }

  try {
    await navigator.clipboard.writeText(shareUrl)
    return 'copied'
  } catch {
    return 'failed'
  }
}
