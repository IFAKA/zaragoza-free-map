import { Toast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'

/** Use outside React too: toasts.add({ title, description }) */
export const toasts = Toast.createToastManager()

function List() {
  const { toasts: list } = Toast.useToastManager()
  return list.map(t => (
    <Toast.Root
      key={t.id} toast={t}
      className="pointer-events-auto absolute inset-x-0 bottom-0 mx-auto flex min-h-[3.73em] w-full items-center rounded-card bg-toast px-4 py-2 text-on-brand shadow-[0_4px_16px_rgb(0_0_0/0.25)] [transition:transform_350ms_var(--ease-drawer),opacity_250ms] data-[starting-style]:translate-y-3 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-3 data-[ending-style]:opacity-0 motion-reduce:data-[starting-style]:translate-y-0"
    >
      <Toast.Content className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <Toast.Title className="m-0 font-extrabold leading-tight" />
          <Toast.Description className="m-0 text-[0.93em] leading-snug" />
        </div>
        <Toast.Close className="min-h-11 shrink-0 rounded-btn border border-on-brand/60 bg-transparent px-3 font-semibold text-on-brand active:scale-[.97]">{String(t.data?.close ?? 'OK')}</Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}

/** Toasts sit at the bottom, above the drawer. */
export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toasts} timeout={7000} limit={1}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] mx-auto h-[6em] max-w-[28em]">
          <List />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
