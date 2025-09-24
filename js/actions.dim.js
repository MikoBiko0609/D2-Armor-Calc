export function buildDimQuery(piece, opts = {}) {
    const perk = String(piece?.setName || "")
        .toLowerCase()
        .trim();
    const tert = String(piece?.tertiary || "")
        .toLowerCase()
        .trim();
    const base = `exactperk:${perk} tertiarystat:${tert}`;

    const type = String(piece?.type || "").toLowerCase();
    const customActive =
        opts.isCustomExoticActive ??
        !!(typeof window !== "undefined" && window?.state?.customExoticEnabled);

    // EXOTIC RULES
    if (type === "exotic") {
        return customActive ? `(is:exotic)` : `(${base} is:exotic)`;
    }

    // LEGENDARY RULES 
    let list = [];
    const global = Array.isArray(opts.globalTuningPlusList)
        ? Array.from(
              new Set(
                  opts.globalTuningPlusList
                      .map((s) =>
                          String(s || "")
                              .toLowerCase()
                              .trim(),
                      )
                      .filter((s) => s && s !== "none"),
              ),
          )
        : [];

    if (global.length > 1) {
        list = global;
    } else {
        const one = String(opts.tuningPlus || "")
            .toLowerCase()
            .trim();
        if (one && one !== "none") list = [one];
    }

    if (list.length === 0) return `${base}`;
    if (list.length === 1) return `${base} tunedstat:${list[0]}`;
    return list.map((st) => `(${base} tunedstat:${st})`).join(" or ");
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // fallback for older browsers / insecure contexts
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
        } catch {}
        document.body.removeChild(ta);
        return true;
    }
}
