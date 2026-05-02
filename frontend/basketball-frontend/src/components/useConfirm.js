import { useContext } from "react";
import { ConfirmContext } from "./ConfirmContextValue";

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return value;
}
