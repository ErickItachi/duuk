import { createContext, useContext } from "react";
import releases from "./releases.json";
export const currentRelease = releases[0];
export const installedBuild = __DUUK_BUILD_ID__;
export const PwaContext = createContext(null);
export const usePwa = () => useContext(PwaContext);
