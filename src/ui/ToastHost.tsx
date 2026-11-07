import { Toast } from '@base-ui/react/toast'
import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { tap } from './motion'

/** Use outside React too: toasts.add({ title, description }) */
export const toasts = Toast.createToastManager()

function List() {
  const { toasts: list } = Toast.useToastManager()
  return list.map(t => (
    <Toast.Root
      key={t.id} toast={t}
      className={`pointer-events-auto absolute inset-x-0 top-0 mx-auto flex min-h-[3.73em] w-full items-center rounded-card bg-toast px-4 py-2 text-on-brand shadow-[0_4px_16px_rgb(0_0_0/0.25)] [transition:translate_var(--dur-slide)_var(--ease-out),opacity_var(--dur-slide)_var(--ease-out)] data-[starting-style]:-translate-y-3 data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-3 data-[ending-style]:opacity-0 data-[ending-style]:[transition-duration:var(--dur-small)] motion-reduce:data-[starting-style]:translate-y-0`}
    >
      <Toast.Content className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <Toast.Title className="m-0 font-extrabold leading-tight" />
          <Toast.Description className="m-0 text-[0.93em] leading-snug" />
        </div>
        {t.data?.action ? <Toast.Close render={<m.button {...tap} onClick={() => (t.data?.onAction as () => void)()} />} className="min-h-[44px] shrink-0 rounded-btn bg-on-brand px-3 font-extrabold text-toast">{String(t.data.action)}</Toast.Close> : null}
        {t.data?.close === '' ? null : <Toast.Close render={<m.button {...tap} />} className="min-h-[44px] shrink-0 rounded-btn border border-on-brand/60 bg-transparent px-3 font-semibold text-on-brand">{String(t.data?.close ?? 'OK')}</Toast.Close>}
      </Toast.Content>
    </Toast.Root>
  ))
}

/** Toasts sit at the top of the screen, over the map, so they never cover the drawer the person is tapping in. */
export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toasts} timeout={7000} limit={1}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] mx-auto h-[6em] max-w-[28em]">
          <List />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
