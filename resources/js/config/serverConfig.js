import { useEffect, useState } from "react";
import api from "./axiosConfig";
import { KEYS } from "./constant";

// Public app config from the server: the course list.
// Cached in memory and localStorage so the register form still has its course
// list when the installed app is opened with a weak connection.
let cache = null;
let inflight = null;

function fromStorage() {
  try { return JSON.parse(localStorage.getItem(KEYS.config)); } catch { return null; }
}

export function loadConfig() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api.get("/config")
      .then(({ data }) => {
        cache = data;
        try { localStorage.setItem(KEYS.config, JSON.stringify(data)); } catch { /* ignore */ }
        return data;
      })
      .catch(() => {
        cache = fromStorage() || { courses: [] };
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useConfig() {
  const [config, setConfig] = useState(cache || fromStorage());
  useEffect(() => {
    let live = true;
    loadConfig().then((c) => live && setConfig(c));
    return () => { live = false; };
  }, []);
  return config;
}
