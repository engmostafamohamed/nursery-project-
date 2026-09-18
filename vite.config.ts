import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import type { ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const DATABASE_HEALTH_PATH = '/rest/v1/nurseries?select=id&limit=1'
const DATABASE_HEALTH_TIMEOUT_MS = 15_000
const DATABASE_HEALTH_ATTEMPTS = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function formatHealthError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return `Supabase database health check timed out after ${DATABASE_HEALTH_TIMEOUT_MS / 1000} seconds.`
  }

  return error instanceof Error ? error.message : String(error)
}

async function fetchSupabaseDatabaseHealth(supabaseUrl: string, supabaseAnonKey: string) {
  let lastMessage = 'Supabase database health check failed.'

  for (let attempt = 1; attempt <= DATABASE_HEALTH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DATABASE_HEALTH_TIMEOUT_MS)

    try {
      const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}${DATABASE_HEALTH_PATH}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      })

      if (response.ok) {
        return { ok: true as const }
      }

      lastMessage =
        response.status === 401
          ? 'Supabase rejected VITE_SUPABASE_ANON_KEY with HTTP 401. Copy the publishable/anon key from the same Supabase project as VITE_SUPABASE_URL.'
          : `Supabase database health check failed with HTTP ${response.status}.`
    } catch (error) {
      lastMessage = `Cannot connect to Supabase database at ${supabaseUrl}: ${formatHealthError(error)}`
    } finally {
      clearTimeout(timeout)
    }

    if (attempt < DATABASE_HEALTH_ATTEMPTS) {
      await sleep(500 * attempt)
    }
  }

  return { ok: false as const, message: lastMessage }
}

function xoDevLogPlugin(supabaseUrl: string, supabaseAnonKey: string) {
  return {
    name: 'xo-dev-log',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__xo-health/database', async (_req: IncomingMessage, res: ServerResponse) => {
        const sendHealth = (payload: { ok: boolean; message?: string }) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }

        if (!supabaseUrl || !supabaseAnonKey) {
          const message = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.'
          console.error(`[database] ${message}`)
          sendHealth({ ok: false, message })
          return
        }

        const result = await fetchSupabaseDatabaseHealth(supabaseUrl, supabaseAnonKey)
        if (result.ok) {
          sendHealth({ ok: true })
          return
        }

        console.error(`[database] ${result.message}`)
        sendHealth(result)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), xoDevLogPlugin(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)],
    server: {
      port: 5000,
      host: '0.0.0.0',
      strictPort: true,
      allowedHosts: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Pre-bundle heavy deps on dev server startup so first page load isn't slow.
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@supabase/supabase-js',
        '@tanstack/react-query',
        'react-hook-form',
        '@hookform/resolvers/zod',
        'zod',
        'sonner',
        'zustand',
        'i18next',
        'react-i18next',
        'lucide-react',
        'recharts',
        'date-fns',
      ],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom')) return 'react-vendor';
            if (id.includes('node_modules/react-router')) return 'router-vendor';
            if (id.includes('node_modules/@supabase')) return 'supabase-vendor';
            if (id.includes('node_modules/@tanstack/react-query')) return 'query-vendor';
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) return 'charts-vendor';
            if (id.includes('node_modules/lucide-react')) return 'icons-vendor';
            if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n-vendor';
            if (id.includes('node_modules/zod') || id.includes('node_modules/@hookform')) return 'validation-vendor';
            if (id.includes('node_modules/@radix-ui')) return 'radix-vendor';
            if (id.includes('node_modules/date-fns')) return 'date-vendor';
            if (id.includes('node_modules/zustand')) return 'state-vendor';
            return undefined;
          },
        },
      },
    },
  }
})
