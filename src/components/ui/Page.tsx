import type { ReactNode } from 'react'
import { cx } from './cx'

type PageWidth = 'default' | 'narrow' | 'full'

type PageProps = {
  children: ReactNode
  width?: PageWidth
  className?: string
}

const WIDTH: Record<PageWidth, string> = {
  default: 'max-w-[1280px]',
  narrow: 'max-w-[768px]',
  full: 'max-w-none',
}

export function Page({ children, width = 'default', className }: PageProps) {
  return (
    <section
      className={cx(
        'mx-auto flex w-full flex-col gap-4 px-4 md:px-6 lg:gap-6 lg:px-8',
        WIDTH[width],
        className,
      )}
    >
      {children}
    </section>
  )
}
