import type { ReactNode } from 'react'

export function AuthBoot() {
  return (
    <div className="auth-boot" role="status">
      Cargando…
    </div>
  )
}

export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <img
            className="auth-logo"
            src="/logo-luminocity.png"
            alt="Luminocity"
            width={96}
            height={96}
          />
        </div>
        <h1>{title}</h1>
        <p className="auth-sub">{subtitle}</p>
        {children}
        {footer ? <p className="auth-switch">{footer}</p> : null}
      </section>
    </div>
  )
}
