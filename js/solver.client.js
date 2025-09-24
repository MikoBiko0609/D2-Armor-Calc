let _worker;
let _lastJobId = 0;
let _pendingResolve = null;
let _debounceMs = 100;
let _debounceTimer = null;
let _latestEnqueued = null;
let _lastPayloadKey = null;
let _inflight = false;

function ensureWorker() {
    if (_worker) return _worker;
    _worker = new Worker(
        new URL("./worker/solver.worker.js", import.meta.url),
        {
            type: "module",
        },
    );
    _worker.onmessage = (e) => {
        const { jobId, ok, result, error } = e.data || {};
        if (jobId !== _lastJobId) return;
        if (_pendingResolve) {
            if (ok) _pendingResolve({ ok: true, ...result });
            else _pendingResolve({ ok: false, error });
            _pendingResolve = null;
        }
        _inflight = false; 
    };
    return _worker;
}

export function setDebounceMs(ms) {
    _debounceMs = Math.max(0, Number(ms) || 0);
}

/**
 * schedule a solve, debounced & last-write-wins.
 * snapshot = { targets, augments, fragments, minorModsCap, custom }
 * returns a promise<{ ok, chosen, totals, feasible, augUsedForUI, error? }>
 */
export function solveAsync(snapshot) {
    ensureWorker();

    if (_pendingResolve) {
        _pendingResolve = null; 
    }
    const promise = new Promise((resolve) => {
        _pendingResolve = resolve;
    });

    _latestEnqueued = snapshot;
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
        const { targets, augments, fragments, minorModsCap, custom } =
            _latestEnqueued || {};

        const augForSolver = Object.assign(
            Array.isArray(augments) ? augments.slice() : [],
            {
                _autoEnabled: !!(snapshot && snapshot.autoAssumeMods),
                _leastFav: (snapshot && snapshot.leastFavStat) || "none",
            },
        );

        const payload = {
            targets,
            fragments,
            minorModsCap,
            custom,
            augments: augForSolver,
        };

        // ---- coalesce identical requests while a job is in flight ----
        const keyNow = JSON.stringify(payload);
        if (keyNow === _lastPayloadKey && _inflight) {
            // reuse the in-flight job; when it resolves, the *latest* _pendingResolve gets it.
            return;
        }

        _lastPayloadKey = keyNow;
        _lastJobId++;
        const jobId = _lastJobId;

        ensureWorker().postMessage({ jobId, payload });
        _inflight = true;
    }, _debounceMs);

    return promise;
}
