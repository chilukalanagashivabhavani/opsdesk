import { useEffect, useState } from "react";

export function usePolling<T>(loader: () => Promise<T>, intervalMs = 0): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await loader();
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load data");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    if (intervalMs > 0) {
      const timer = window.setInterval(() => void load(), intervalMs);
      return () => {
        active = false;
        window.clearInterval(timer);
      };
    }
    return () => { active = false; };
  }, [loader, intervalMs]);

  return { data, loading, error };
}
