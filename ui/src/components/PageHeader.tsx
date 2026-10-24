import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from './Icons'

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string
  back?: boolean
  action?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="page-header">
      {back && (
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="Back">
          <ChevronLeftIcon />
        </button>
      )}
      <h1>{title}</h1>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  )
}
