import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";
import { useNow } from "./useNow";

/** ساعة متزامنة مع خادم Firebase حتى يبدأ سؤال المواجهة للجميع في الوقت نفسه. */
export function useServerNow(intervalMs: number | null): number {
  const localNow = useNow(intervalMs);
  const [idleNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);

  useEffect(() => onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    setOffset(Number(snapshot.val()) || 0);
  }), []);

  return (localNow || idleNow) + offset;
}
