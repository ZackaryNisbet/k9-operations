import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createReloadScheduler } from "../shared/reloadScheduler.js";

// Deterministic, injectable fake clock so the scheduler can be tested without a DOM
// or real timers. Mirrors just enough of setTimeout/setInterval semantics.
function makeFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();

  const timers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timeouts.set(id, { fn, time: now + ms });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (fn, ms) => {
      const id = nextId++;
      intervals.set(id, { fn, ms, next: now + ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
  };

  function advance(ms) {
    const target = now + ms;
    for (;;) {
      let soonest = Infinity;
      let kind = null;
      let key = null;
      for (const [id, t] of timeouts) {
        if (t.time <= target && t.time < soonest) {
          soonest = t.time;
          kind = "timeout";
          key = id;
        }
      }
      for (const [id, t] of intervals) {
        if (t.next <= target && t.next < soonest) {
          soonest = t.next;
          kind = "interval";
          key = id;
        }
      }
      if (kind === null) break;
      now = soonest;
      if (kind === "timeout") {
        const t = timeouts.get(key);
        timeouts.delete(key);
        t.fn();
      } else {
        const t = intervals.get(key);
        t.next += t.ms;
        t.fn();
      }
    }
    now = target;
  }

  return { timers, advance };
}

function makeFakeVisibility(initiallyVisible = true) {
  let visible = initiallyVisible;
  const subs = new Set();
  return {
    visibility: {
      isVisible: () => visible,
      subscribe: (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    },
    set(next) {
      visible = next;
      subs.forEach((cb) => cb());
    },
  };
}

describe("createReloadScheduler", () => {
  it("coalesces a burst of reload requests into a single reload", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const { visibility } = makeFakeVisibility(true);
    const s = createReloadScheduler(reload, { debounceMs: 500, pollMs: 60_000, timers, visibility });

    s.start();
    s.requestReload();
    s.requestReload();
    s.requestReload();
    expect(reload).toHaveBeenCalledTimes(0); // still inside the debounce window

    advance(499);
    expect(reload).toHaveBeenCalledTimes(0);
    advance(1);
    expect(reload).toHaveBeenCalledTimes(1); // the whole burst collapsed to one
    s.stop();
  });

  it("ignores requests made before start()", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const { visibility } = makeFakeVisibility(true);
    const s = createReloadScheduler(reload, { debounceMs: 500, timers, visibility });

    s.requestReload();
    advance(5_000);
    expect(reload).toHaveBeenCalledTimes(0);
  });

  it("defers reloads while hidden and runs one catch-up reload on becoming visible", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const vis = makeFakeVisibility(false); // start hidden
    const s = createReloadScheduler(reload, { debounceMs: 500, pollMs: 60_000, timers, visibility: vis.visibility });

    s.start();
    s.requestReload();
    advance(2_000);
    expect(reload).toHaveBeenCalledTimes(0); // hidden tab never fetches

    vis.set(true);
    expect(reload).toHaveBeenCalledTimes(1); // single catch-up on focus
    s.stop();
  });

  it("defers a reload that was scheduled while visible but fires while hidden", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const vis = makeFakeVisibility(true);
    const s = createReloadScheduler(reload, { debounceMs: 500, pollMs: 60_000, timers, visibility: vis.visibility });

    s.start();
    s.requestReload();
    advance(200);
    vis.set(false); // tab hidden before the debounce fires
    advance(500); // debounce elapses but we are hidden now
    expect(reload).toHaveBeenCalledTimes(0);

    vis.set(true);
    expect(reload).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("runs the safety poll only while visible", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const { visibility } = makeFakeVisibility(true);
    const s = createReloadScheduler(reload, { debounceMs: 500, pollMs: 1_000, timers, visibility });

    s.start();
    advance(1_000);
    expect(reload).toHaveBeenCalledTimes(1);
    advance(2_000);
    expect(reload).toHaveBeenCalledTimes(3);
    s.stop();
  });

  it("suppresses the poll while hidden and catches up once on visibility", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const vis = makeFakeVisibility(true);
    const s = createReloadScheduler(reload, { debounceMs: 500, pollMs: 1_000, timers, visibility: vis.visibility });

    s.start();
    vis.set(false);
    advance(5_000); // five poll ticks, all suppressed
    expect(reload).toHaveBeenCalledTimes(0);

    vis.set(true);
    expect(reload).toHaveBeenCalledTimes(1); // collapsed to a single catch-up
    s.stop();
  });

  it("stops all reloads after stop()", () => {
    const reload = vi.fn();
    const { timers, advance } = makeFakeTimers();
    const { visibility } = makeFakeVisibility(true);
    const s = createReloadScheduler(reload, { debounceMs: 500, pollMs: 1_000, timers, visibility });

    s.start();
    s.requestReload();
    s.stop();
    advance(10_000);
    expect(reload).toHaveBeenCalledTimes(0);

    s.requestReload();
    advance(10_000);
    expect(reload).toHaveBeenCalledTimes(0);
  });
});

// Guard test: lock in that the core data hook actually routes its refresh triggers
// through the scheduler and no longer polls every 30s regardless of visibility.
describe("useData egress wiring", () => {
  const source = readFileSync(new URL("../useData.js", import.meta.url), "utf8");

  it("imports and uses the reload scheduler", () => {
    expect(source).toContain("createReloadScheduler");
    expect(source).toContain("scheduler.start()");
    expect(source).toContain("scheduler.stop()");
    expect(source).toContain("scheduler.requestReload()");
  });

  it("drops the unconditional 30s full-reload poll", () => {
    expect(source).not.toContain("setInterval(() => load(), 30000)");
  });

  it("guards realtime reloads by location_id", () => {
    expect(source).toContain("onLocationChange");
    expect(source).toContain("row.location_id !== locationId");
  });
});
