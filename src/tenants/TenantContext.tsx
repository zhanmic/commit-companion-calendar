import { createContext, useContext, type ReactNode } from 'react'
import type { TenantConfig } from './types'

const TenantContext = createContext<TenantConfig | null>(null)

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantConfig
  children: ReactNode
}) {
  return (
    <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
  )
}

export function useTenant(): TenantConfig {
  const tenant = useContext(TenantContext)
  if (!tenant) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return tenant
}
