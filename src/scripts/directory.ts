/**
 * Client-side faceted filtering for the directory tables.
 *
 * Markup contract:
 *   <table class="dir" data-dims="sector,size,geography"> ...
 *   <tbody> <tr class="row" data-sector="A|B" data-size="C" ...> </tr>
 *   <input type="checkbox" data-facet="sector" value="A">
 *   <span data-facet-count="sector:A">12</span>
 *   span[data-showing] for the live "showing N" count
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
  const searchBar = root.querySelector<HTMLElement>("[data-searchbar]");
  const searchInput = root.querySelector<HTMLInputElement>("[data-search-input]");
  const searchClear = root.querySelector<HTMLButtonElement>("[data-search-clear]");
  const filtersToggle = root.querySelector<HTMLButtonElement>("[data-filters-toggle]");
  const sidebar = root.querySelector<HTMLElement>(".sidebar");

  // Parse each row's values per dimension into Sets.
  const parsed = rows.map((el) => {
    const vals: Record<string, Set<string>> = {};
    for (const d of dims) {
      const raw = el.dataset[d] ?? "";
      vals[d] = new Set(raw.split("|").map((v) => v.trim()).filter(Boolean));
    }
    const search = (el.dataset.search ?? el.dataset.name ?? "").toLowerCase();
    return { el, vals, name: el.dataset.name ?? "", search };
  });

  function query(): string {
    return (searchInput?.value ?? "").trim().toLowerCase();
  }

  function matchesSearch(row: (typeof parsed)[number], q: string) {
    return q === "" || row.search.includes(q);
  }

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
    const q = query();
    let visible = 0;

    searchBar?.classList.toggle("has-query", q !== "");

    for (const row of parsed) {
      const show = rowMatches(row, checked) && matchesSearch(row, q);
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
        if (rowMatches(row, checked, dim) && matchesSearch(row, q) && row.vals[dim].has(val)) n++;
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

  checkboxes.forEach((cb) => cb.addEventListener("change", apply));
  searchInput?.addEventListener("input", apply);
  searchClear?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    searchInput?.focus();
    apply();
  });
  resetBtn?.addEventListener("click", () => {
    checkboxes.forEach((cb) => (cb.checked = false));
    if (searchInput) searchInput.value = "";
    apply();
  });

  // Mobile: collapse the filter sidebar behind a Show/Hide toggle.
  filtersToggle?.addEventListener("click", () => {
    const open = sidebar?.classList.toggle("is-open") ?? false;
    filtersToggle.setAttribute("aria-expanded", String(open));
    filtersToggle.textContent = open ? "Hide" : "Show";
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
  const linkSlot = panel.querySelector<HTMLElement>("[data-detail-link-slot]");
  const bodyEl = panel.querySelector<HTMLElement>("[data-detail-body]");
  const prevBtn = panel.querySelector<HTMLButtonElement>("[data-detail-prev]");
  const nextBtn = panel.querySelector<HTMLButtonElement>("[data-detail-next]");
  const posEl = panel.querySelector<HTMLElement>("[data-detail-pos]");
  let lastFocus: HTMLElement | null = null;
  let current: HTMLTableRowElement | null = null;

  /** Rows currently visible (passing filters/search), in display order. */
  function visibleRows() {
    return rows.filter((r) => !r.classList.contains("row-hidden"));
  }

  /** Reflect the open row's position and enable/disable prev/next. */
  function updateNav() {
    const list = visibleRows();
    const idx = current ? list.indexOf(current) : -1;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= list.length - 1;
    if (posEl) posEl.textContent = idx >= 0 ? `${idx + 1} / ${list.length}` : "";
  }

  /** Move to the previous/next visible row without closing the panel. */
  function navigate(dir: 1 | -1) {
    const list = visibleRows();
    if (!current) return;
    const ni = list.indexOf(current) + dir;
    if (ni >= 0 && ni < list.length) open(list[ni]);
  }

  interface Detail {
    title: string;
    initials: string;
    url?: string;
    urlLabel?: string;
    fields: Record<string, string>;
    minors?: { name: string; why: string; url: string }[];
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
    if (linkSlot) {
      linkSlot.replaceChildren();
      if (data.url) {
        const linkEl = document.createElement("a");
        linkEl.className = "detail-link";
        linkEl.href = data.url;
        linkEl.textContent = data.urlLabel ?? "Visit ↗";
        linkEl.target = "_blank";
        linkEl.rel = "noopener";
        linkSlot.append(linkEl);
      }
    }

    bodyEl.replaceChildren();
    for (const [label, value] of Object.entries(data.fields)) {
      if (!value || value.trim().toLowerCase() === "unknown") continue; // omit empty / "Unknown"
      const wrap = document.createElement("div");
      wrap.className = "field";
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrap.append(dt, dd);
      bodyEl.append(wrap);
    }

    // Suggested DSU minors for this employer's field(s). Omitted when none.
    if (data.minors && data.minors.length) {
      const wrap = document.createElement("div");
      wrap.className = "field field-minors";
      const dt = document.createElement("dt");
      dt.textContent = "Suggested DSU minors";
      const ul = document.createElement("ul");
      ul.className = "minors-list";
      for (const m of data.minors) {
        const li = document.createElement("li");
        if (m.url && m.url.trim() !== "") {
          const a = document.createElement("a");
          a.href = m.url;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = m.name;
          li.append(a);
        } else {
          li.textContent = m.name;
        }
        if (m.why) {
          const span = document.createElement("span");
          span.className = "minor-why";
          span.textContent = m.why;
          li.append(span);
        }
        ul.append(li);
      }
      wrap.append(dt, ul);
      bodyEl.append(wrap);
    }

    if (panel.hidden) lastFocus = document.activeElement as HTMLElement;
    current = row;
    panel.hidden = false;
    updateNav();
    card?.focus();
  }

  function close() {
    panel.hidden = true;
    current = null;
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
  prevBtn?.addEventListener("click", () => navigate(-1));
  nextBtn?.addEventListener("click", () => navigate(1));

  document.addEventListener("keydown", (e) => {
    if (panel.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      navigate(1);
    }
  });
}

setup();
