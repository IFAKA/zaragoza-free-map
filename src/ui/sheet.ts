import { createContext, useContext } from 'react'

/** True while the mobile sheet is closed (only the tab bar shows): the page body is then inert so it cannot take focus off-screen. */
export const SheetClosedCtx = createContext(false)
export const useSheetClosed = () => useContext(SheetClosedCtx)
