import { useEffect, useState } from "react";
import { socket } from "./socket.js";

export function useRoomState() {
  const [state, setState] = useState(null);

  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on("room:state", onState);
    if (socket.connected) {
      // server already emitted on connect; request nothing extra
    }
    return () => {
      socket.off("room:state", onState);
    };
  }, []);

  return state;
}
