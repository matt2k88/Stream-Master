import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface SideMenuValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const SideMenuContext = createContext<SideMenuValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export function SideMenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <SideMenuContext.Provider value={value}>{children}</SideMenuContext.Provider>;
}

export const useSideMenu = () => useContext(SideMenuContext);
