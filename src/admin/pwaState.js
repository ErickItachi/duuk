import { createContext, useContext } from "react";
export const currentRelease = __DUUK_RELEASE__;
export const installedBuild = __DUUK_BUILD_ID__;
export const PwaContext = createContext(null);
export const usePwa = () => useContext(PwaContext);
