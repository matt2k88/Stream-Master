import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface OpenOptions {
  /**
   * Render the drawer with a translucent backdrop + panel so the content
   * playing behind it (e.g. the video player) stays partially visible.
   */
  transparent?: boolean;
}

interface SideMenuValue {
  isOpen: boolean;
  transparent: boolean;
  open: (opts?: OpenOptions) => void;
  close: () => void;
}

const SideMenuContext = createContext<SideMenuValue>({
  isOpen: false,
  transparent: false,
  open: () => {},
  close: () => {},
});

export function SideMenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const open = useCallback((opts?: OpenOptions) => {
    setTransparent(!!opts?.transparent);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(
    () => ({ isOpen, transparent, open, close }),
    [isOpen, transparent, open, close],
  );
  return <SideMenuContext.Provider value={value}>{children}</SideMenuContext.Provider>;
}

export const useSideMenu = () => useContext(SideMenuContext);
