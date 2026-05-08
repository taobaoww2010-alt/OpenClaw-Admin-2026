import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

async function checkSetupStatus(): Promise<boolean> {
  try {
    const authStore = useAuthStore()
    const token = authStore.getToken()
    const res = await fetch('/api/setup/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return false
    const data = await res.json()
    return data.ok ? !!data.setupCompleted : false
  } catch {
    return false
  }
}

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  let authEnabled = false
  try {
    authEnabled = await authStore.checkAuthConfig()
  } catch (error) {
    console.error('[Router] checkAuthConfig failed:', error)
    authEnabled = false
  }

  if (!authEnabled) {
    if (to.name === 'Login') {
      next({ name: 'Dashboard' })
      return
    }
    next()
    return
  }

  if (to.meta.public) {
    if (to.name === 'Login' && authStore.isAuthenticated) {
      try {
        const valid = await authStore.checkAuth()
        if (valid) {
          const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
          next(redirect)
          return
        }
      } catch (error) {
        console.error('[Router] checkAuth failed:', error)
      }
    }
    next()
    return
  }

  if (!authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  try {
    const valid = await authStore.checkAuth()
    if (!valid) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
  } catch (error) {
    console.error('[Router] checkAuth failed:', error)
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // Check if setup is completed, redirect to Settings if not
  if (to.name !== 'Settings' && to.name !== 'Login') {
    const setupCompleted = await checkSetupStatus()
    console.log('[Router] Setup check:', { setupCompleted, redirectTo: to.name })
    if (!setupCompleted) {
      next({ name: 'Settings' })
      return
    }
  }

  next()
})

export default router
