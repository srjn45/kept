import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * When isOpen becomes true, focus the first focusable element inside modalRef.
 * When isOpen becomes false, restore focus to the previously focused element.
 */
export function useFocusModal(isOpen: boolean) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    previousActiveRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = modalRef.current
    if (!el) return
    const first = el.querySelector<HTMLElement>(FOCUSABLE)
    if (first) {
      requestAnimationFrame(() => first.focus())
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    const prev = previousActiveRef.current
    if (prev?.ownerDocument.contains(prev)) {
      requestAnimationFrame(() => prev.focus())
    }
    previousActiveRef.current = null
  }, [isOpen])

  return modalRef
}
