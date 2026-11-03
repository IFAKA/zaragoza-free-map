import { createContext, useContext } from 'react'

/** True while the mobile sheet is closed (only the tab bar shows): the page body is then inert so it cannot take focus off-screen. */
export const SheetClosedCtx = createContext(false)
export const useSheetClosed = () => useContext(SheetClosedCtx)

/** True while the person's position is still being found (the browser is asked, or the permission is being read). The list is then ranked from the city centre, so live-times cards wait: they would ask the city for a stop that is replaced a moment later. */
export const LocatingCtx = createContext(false)
export const useLocating = () => useContext(LocatingCtx)
