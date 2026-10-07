import { useEffect, useId } from "react";
export const dirtyForms = new Set();
export function useUnsavedChanges(dirty) {
  const id = useId();
  useEffect(() => {
    if (dirty) dirtyForms.add(id);
    else dirtyForms.delete(id);
    const prevent = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => {
      dirtyForms.delete(id);
      window.removeEventListener("beforeunload", prevent);
    };
  }, [dirty, id]);
}
