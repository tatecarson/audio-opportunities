/**
 * Client-side faceted filtering for the directory tables.
 *
 * Markup contract:
 *   <table class="dir" data-dims="sector,size,geography"> ...
 *   <tbody> <tr class="row" data-sector="A|B" data-size="C" ...> </tr>
 *   <input type="checkbox" data-facet="sector" value="A">
 *   <span data-facet-count="sector:A">12</span>
 *   buttons[data-sort="az"|"count"], span[data-showing], span[data-total]
 *
 * Within a dimension, checked options are OR'd; across dimensions they are AND'd.
 * Facet counts update to reflect rows matching the *other* dimensions.
 */

function setup(root: ParentNode = document) {
  const table = root.querySelector<HTMLTableElement>("table.dir[data-dims]");
  if (!table) return;

  const dims = (table.dataset.dims ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tbody = table.querySelector("tbody")!;
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr.row"));
  const emptyRow = tbody.querySelector<HTMLTableRowElement>("tr.empty-row");
  const checkboxes = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-facet]'),
  );
  const showingEl = root.querySelector<HTMLElement>("[data-showing]");
  const resetBtn = root.querySelector<HTMLButtonElement>("[data-reset]");
  const sortBtns = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-sort]"));

  // Parse each row's values per dimension into Sets.
  const parsed = rows.map((el) => {
    const vals: Record<string, Set<string>> = {};
    for (const d of dims) {
      const raw = el.dataset[d] ?? "";
      vals[d] = new Set(raw.split("|").map((v) => v.trim()).filter(Boolean));
    }
    return { el, vals, name: el.dataset.name ?? "" };
  });

  function checkedByDim(): Record<string, Set<string>> {
    const out: Record<string, Set<string>> = {};
    for (const d of dims) out[d] = new Set();
    for (const cb of checkboxes) {
      if (cb.checked) out[cb.dataset.facet!].add(cb.value);
    }
    return out;
  }

  function rowMatches(row: (typeof parsed)[number], checked: Record<string, Set<string>>, exclude?: string) {
    for (const d of dims) {
      if (d === exclude) continue;
      const sel = checked[d];
      if (sel.size === 0) continue;
      let hit = false;
      for (const v of sel) {
        if (row.vals[d].has(v)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    return true;
  }

  function apply() {
    const checked = checkedByDim();
    let visible = 0;

    for (const row of parsed) {
      const show = rowMatches(row, checked);
      row.el.classList.toggle("row-hidden", !show);
      if (show) visible++;
    }

    // Re-rank visible rows.
    let rank = 0;
    for (const row of parsed) {
      if (row.el.classList.contains("row-hidden")) continue;
      rank++;
      const rk = row.el.querySelector<HTMLElement>(".col-rank");
      if (rk) rk.textContent = String(rank).padStart(2, "0");
    }

    // Empty state.
    if (emptyRow) emptyRow.classList.toggle("row-hidden", visible !== 0);

    // Facet counts (count rows that match the OTHER dimensions and carry this value).
    for (const cb of checkboxes) {
      const dim = cb.dataset.facet!;
      const val = cb.value;
      let n = 0;
      for (const row of parsed) {
        if (rowMatches(row, checked, dim) && row.vals[dim].has(val)) n++;
      }
      const span = root.querySelector<HTMLElement>(`[data-facet-count="${dim}:${cssEscape(val)}"]`);
      if (span) span.textContent = String(n);
      cb.closest(".facet-opt")?.classList.toggle("is-zero", n === 0 && !cb.checked);
    }

    if (showingEl) showingEl.textContent = String(visible);
  }

  function cssEscape(v: string) {
    return v.replace(/"/g, '\\"');
  }

  function sortBy(mode: string) {
    const sorted = [...parsed];
    if (mode === "az") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // restore original DOM order
      sorted.sort((a, b) => rows.indexOf(a.el) - rows.indexOf(b.el));
    }
    for (const row of sorted) tbody.insertBefore(row.el, emptyRow);
    sortBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sort === mode)));
    apply();
  }

  checkboxes.forEach((cb) => cb.addEventListener("change", apply));
  sortBtns.forEach((b) => b.addEventListener("click", () => sortBy(b.dataset.sort!)));
  resetBtn?.addEventListener("click", () => {
    checkboxes.forEach((cb) => (cb.checked = false));
    apply();
  });

  setupDetailPanel(root, rows);
  apply();
}

/** Row-click → detail sidebar, populated from each row's data-detail payload. */
function setupDetailPanel(root: ParentNode, rows: HTMLTableRowElement[]) {
  const panel = root.querySelector<HTMLElement>("[data-detail-panel]");
  if (!panel) return;

  const card = panel.querySelector<HTMLElement>(".detail-card");
  const avatarEl = panel.querySelector<HTMLElement>("[data-detail-avatar]");
  const titleEl = panel.querySelector<HTMLElement>("[data-detail-title]");
  const linkEl = panel.querySelector<HTMLAnchorElement>("[data-detail-link]");
  const bodyEl = panel.querySelector<HTMLElement>("[data-detail-body]");
  let lastFocus: HTMLElement | null = null;

  interface Detail {
    title: string;
    initials: string;
    url?: string;
    urlLabel?: string;
    fields: Record<string, string>;
  }

  function open(row: HTMLTableRowElement) {
    const raw = row.dataset.detail;
    if (!raw || !bodyEl) return;
    let data: Detail;
    try {
      data = JSON.parse(raw) as Detail;
    } catch {
      return;
    }

    if (avatarEl) avatarEl.textContent = data.initials ?? "";
    if (titleEl) titleEl.textContent = data.title ?? "";
    if (linkEl) {
      if (data.url) {
        linkEl.href = data.url;
        linkEl.textContent = data.urlLabel ?? "Visit ↗";
        linkEl.hidden = false;
      } else {
        linkEl.hidden = true;
      }
    }

    bodyEl.replaceChildren();
    for (const [label, value] of Object.entries(data.fields)) {
      if (!value) continue; // omit empty fields
      const wrap = document.createElement("div");
      wrap.className = "field";
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrap.append(dt, dd);
      bodyEl.append(wrap);
    }

    lastFocus = document.activeElement as HTMLElement;
    panel.hidden = false;
    card?.focus();
  }

  function close() {
    panel.hidden = true;
    lastFocus?.focus();
  }

  for (const row of rows) {
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.addEventListener("click", (e) => {
      // Let real links (e.g. the company name) behave normally.
      if ((e.target as HTMLElement).closest("a")) return;
      open(row);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if ((e.target as HTMLElement).closest("a")) return;
        e.preventDefault();
        open(row);
      }
    });
  }

  panel.querySelectorAll<HTMLElement>("[data-detail-close]").forEach((el) =>
    el.addEventListener("click", close),
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) close();
  });
}

setup();
