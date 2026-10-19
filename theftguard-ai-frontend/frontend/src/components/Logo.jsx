// Lightning bolt inside a shield. "onDark" swaps the colours for the black sidebar.
export function LogoMark({ tone = 'onLight', className = 'h-8 w-8' }) {
  const shield = tone === 'onDark' ? '#F4C430' : '#0F0F0F'
  const bolt = tone === 'onDark' ? '#0F0F0F' : '#F4C430'
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="TheftGuard AI logo">
      <path d="M16 2l11 4v8c0 7.2-4.6 13.2-11 16C9.6 27.2 5 21.2 5 14V6l11-4z" fill={shield} />
      <path d="M17.8 7L10.5 17.2h4.6L13.9 25l7.6-10.4h-4.7z" fill={bolt} />
    </svg>
  )
}

export default function Logo({ tone = 'onLight', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark tone={tone} />
      <span className={`font-display text-lg font-bold tracking-tight ${tone === 'onDark' ? 'text-white' : 'text-ink'}`}>
        TheftGuard <span className={tone === 'onDark' ? 'text-gold' : 'text-gold-deep'}>AI</span>
      </span>
    </span>
  )
}
