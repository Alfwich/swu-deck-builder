import type { SyntheticEvent } from 'react'

export function revealImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.classList.add('is-loaded')
}
